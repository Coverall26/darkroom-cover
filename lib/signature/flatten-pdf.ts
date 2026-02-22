import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import prisma from "@/lib/prisma";
import { getFile } from "@/lib/files/get-file";
import { getStorageProvider } from "@/lib/storage/providers";
import { logSignatureEvent } from "@/lib/signature/audit-logger";
import { reportError } from "@/lib/error";

export interface FlattenSignatureOptions {
  documentId: string;
  /** Save flattened PDF to storage and update DB record */
  saveToStorage?: boolean;
}

export interface FlattenResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  signedFileUrl?: string;
  error?: string;
}

/**
 * Flatten signatures and field values onto a PDF document.
 * This embeds signature images and text field values directly into the PDF
 * pages, producing a final signed document.
 */
export async function flattenSignatureDocument(
  options: FlattenSignatureOptions,
): Promise<FlattenResult> {
  const { documentId, saveToStorage = true } = options;

  try {
    const document = await prisma.signatureDocument.findUnique({
      where: { id: documentId },
      include: {
        recipients: {
          orderBy: { signingOrder: "asc" },
        },
        fields: {
          orderBy: [{ pageNumber: "asc" }, { y: "asc" }],
        },
        team: { select: { name: true } },
      },
    });

    if (!document) {
      return { success: false, error: "Document not found" };
    }

    // Get original PDF
    const fileUrl = await getFile({
      type: document.storageType,
      data: document.file,
    });

    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) {
      return { success: false, error: "Failed to fetch original PDF" };
    }

    const pdfBytes = await pdfResponse.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Embed signatures and field values into PDF pages
    for (const field of document.fields) {
      if (!field.value && field.type !== "SIGNATURE") continue;

      const pageIndex = field.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Convert percentage coordinates to absolute PDF coordinates
      const x = (field.x / 100) * pageWidth;
      const y =
        pageHeight -
        (field.y / 100) * pageHeight -
        (field.height / 100) * pageHeight;
      const fieldWidth = (field.width / 100) * pageWidth;
      const fieldHeight = (field.height / 100) * pageHeight;

      if (field.type === "SIGNATURE" || field.type === "INITIALS") {
        // For INITIALS fields, use field.value (contains the initials base64 image
        // stored by the signing component). For SIGNATURE fields, use recipient.signatureImage
        // (the encrypted/stored primary signature). Fall back to the other source if primary is empty.
        const recipient = document.recipients.find(
          (r) => r.id === field.recipientId,
        );

        let imageDataUrl: string | null = null;

        if (field.type === "INITIALS" && field.value) {
          // Initials are stored as base64 data URLs in the field value
          imageDataUrl = field.value;
        } else if (recipient?.signatureImage) {
          imageDataUrl = recipient.signatureImage;
        }

        if (imageDataUrl) {
          try {
            let signatureDataUrl = imageDataUrl;

            // Try to decrypt if it's encrypted JSON
            if (
              signatureDataUrl.startsWith("{") ||
              signatureDataUrl.startsWith("[")
            ) {
              try {
                const { decryptStoredSignature } = await import(
                  "@/lib/signature/encryption-service"
                );
                const decryptedBase64 =
                  await decryptStoredSignature(signatureDataUrl);
                signatureDataUrl = `data:image/png;base64,${decryptedBase64}`;
              } catch {
                // If decryption fails, skip this signature
                continue;
              }
            }

            if (signatureDataUrl.startsWith("data:image/png")) {
              const base64Data = signatureDataUrl.split(",")[1];
              const signatureBytes = Buffer.from(base64Data, "base64");
              const signatureImage = await pdfDoc.embedPng(signatureBytes);

              // Maintain aspect ratio
              const aspectRatio = signatureImage.width / signatureImage.height;
              let drawWidth = fieldWidth;
              let drawHeight = fieldWidth / aspectRatio;

              if (drawHeight > fieldHeight) {
                drawHeight = fieldHeight;
                drawWidth = fieldHeight * aspectRatio;
              }

              page.drawImage(signatureImage, {
                x: x + (fieldWidth - drawWidth) / 2,
                y: y + (fieldHeight - drawHeight) / 2,
                width: drawWidth,
                height: drawHeight,
              });
            }
          } catch (err) {
            console.error("Failed to embed signature/initials:", err);
          }
        }
      } else if (field.type === "CHECKBOX") {
        if (field.value === "true") {
          const fontSize = Math.min(fieldHeight * 0.8, 14);
          page.drawText("\u2713", {
            x: x + fieldWidth / 2 - fontSize / 3,
            y: y + fieldHeight / 2 - fontSize / 3,
            size: fontSize,
            font: helveticaFont,
            color: rgb(0, 0, 0),
          });
        }
      } else if (field.value) {
        const fontSize = Math.min(fieldHeight * 0.6, 12);
        page.drawText(field.value, {
          x: x + 4,
          y: y + fieldHeight / 2 - fontSize / 3,
          size: fontSize,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Add certificate of completion on last page for completed documents
    if (document.status === "COMPLETED") {
      const lastPage = pages[pages.length - 1];
      const { width: pageWidth } = lastPage.getSize();

      const auditBoxHeight = 80 + document.recipients.length * 14;
      const auditBoxY = 20;
      const auditBoxX = 20;
      const auditBoxWidth = pageWidth - 40;

      lastPage.drawRectangle({
        x: auditBoxX,
        y: auditBoxY,
        width: auditBoxWidth,
        height: auditBoxHeight,
        color: rgb(0.97, 0.97, 0.97),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });

      let textY = auditBoxY + auditBoxHeight - 16;

      lastPage.drawText("Certificate of Completion — FundRoom Sign", {
        x: auditBoxX + 10,
        y: textY,
        size: 10,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      textY -= 14;
      lastPage.drawText(`Document: ${document.title}`, {
        x: auditBoxX + 10,
        y: textY,
        size: 8,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });

      if (document.completedAt) {
        textY -= 12;
        lastPage.drawText(
          `Completed: ${new Date(document.completedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
          {
            x: auditBoxX + 10,
            y: textY,
            size: 8,
            font: helveticaFont,
            color: rgb(0.3, 0.3, 0.3),
          },
        );
      }

      textY -= 16;
      lastPage.drawText("Signers:", {
        x: auditBoxX + 10,
        y: textY,
        size: 8,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3),
      });

      for (const recipient of document.recipients.filter(
        (r) => r.status === "SIGNED",
      )) {
        textY -= 12;
        const signedDate = recipient.signedAt
          ? new Date(recipient.signedAt).toLocaleString("en-US", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
        lastPage.drawText(
          `  ${recipient.name} (${recipient.email}) - Signed ${signedDate}${recipient.ipAddress ? ` from ${recipient.ipAddress}` : ""}`,
          {
            x: auditBoxX + 10,
            y: textY,
            size: 7,
            font: helveticaFont,
            color: rgb(0.4, 0.4, 0.4),
          },
        );
      }
    }

    const flattenedPdfBytes = await pdfDoc.save();

    // Save to storage if requested
    let signedFileUrl: string | undefined;
    if (saveToStorage) {
      try {
        const provider = getStorageProvider();
        const safeTitle = document.title.replace(/[^a-zA-Z0-9-_]/g, "_");
        const storageKey = `signed-documents/${document.teamId}/${documentId}/${safeTitle}_signed_${Date.now()}.pdf`;

        await provider.put(storageKey, Buffer.from(flattenedPdfBytes), {
          contentType: "application/pdf",
        });

        const existing = await prisma.signatureDocument.findUnique({
          where: { id: documentId },
          select: { metadata: true, storageType: true },
        });
        const existingMeta = (typeof existing?.metadata === "object" && existing?.metadata !== null)
          ? existing.metadata as Record<string, unknown>
          : {};

        const storageType = existing?.storageType || "S3_PATH";

        await prisma.signatureDocument.update({
          where: { id: documentId },
          data: {
            status: "COMPLETED",
            signedFileUrl: storageKey,
            signedFileType: storageType,
            signedAt: new Date(),
            // Keep metadata update for backward compatibility
            metadata: { ...existingMeta, signedFileUrl: storageKey },
          },
        });

        signedFileUrl = storageKey;
      } catch (storageError) {
        console.error("Failed to save flattened PDF to storage:", storageError);
        // Non-fatal: we still have the bytes
      }
    }

    return {
      success: true,
      pdfBytes: flattenedPdfBytes,
      signedFileUrl,
    };
  } catch (error) {
    reportError(error, {
      path: "lib/signature/flatten-pdf",
      action: "flatten_signature_document",
    });
    console.error("Error flattening signature document:", error);
    return {
      success: false,
      error: "Failed to flatten signature document",
    };
  }
}

/**
 * Flatten a signature image directly onto a PDF buffer at specified coordinates.
 * Used for inline signing (e.g., LP onboarding NDA signing without pre-placed fields).
 */
export async function flattenSignatureOnPdf(
  pdfBuffer: Buffer | Uint8Array,
  signatureDataUrl: string,
  placements: Array<{
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();

  if (!signatureDataUrl.startsWith("data:image/png")) {
    throw new Error("Signature must be a PNG data URL");
  }

  const base64Data = signatureDataUrl.split(",")[1];
  const signatureBytes = Buffer.from(base64Data, "base64");
  const signatureImage = await pdfDoc.embedPng(signatureBytes);

  for (const placement of placements) {
    const pageIndex = placement.pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();

    const x = (placement.x / 100) * pageWidth;
    const y =
      pageHeight -
      (placement.y / 100) * pageHeight -
      (placement.height / 100) * pageHeight;
    const fieldWidth = (placement.width / 100) * pageWidth;
    const fieldHeight = (placement.height / 100) * pageHeight;

    const aspectRatio = signatureImage.width / signatureImage.height;
    let drawWidth = fieldWidth;
    let drawHeight = fieldWidth / aspectRatio;

    if (drawHeight > fieldHeight) {
      drawHeight = fieldHeight;
      drawWidth = fieldHeight * aspectRatio;
    }

    page.drawImage(signatureImage, {
      x: x + (fieldWidth - drawWidth) / 2,
      y: y + (fieldHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return pdfDoc.save();
}
