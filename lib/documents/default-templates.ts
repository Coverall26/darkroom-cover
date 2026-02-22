/**
 * Default Document Template HTML Content
 *
 * Platform-provided default templates for NDA and Subscription Agreement.
 * Templates use {{merge_field}} placeholders that are resolved at rendering
 * time via the merge field engine (lib/documents/merge-fields.ts).
 *
 * These templates are seeded into the DocumentTemplate model during first
 * tenant setup and can be overridden by GP-uploaded custom templates.
 */

// ---------------------------------------------------------------------------
// Shared styles used across all default templates
// ---------------------------------------------------------------------------

const SHARED_STYLES = `
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #111; margin: 0; padding: 40px 60px; }
  h1 { font-size: 18pt; text-align: center; margin-bottom: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 14pt; margin-top: 24px; margin-bottom: 8px; font-weight: bold; }
  .subtitle { text-align: center; font-size: 11pt; color: #444; margin-bottom: 32px; }
  .section { margin-bottom: 16px; }
  .section-number { font-weight: bold; }
  .indent { padding-left: 24px; }
  .signature-block { margin-top: 48px; page-break-inside: avoid; }
  .sig-line { border-bottom: 1px solid #000; width: 300px; margin-top: 40px; margin-bottom: 4px; }
  .sig-label { font-size: 10pt; color: #444; }
  .date-line { margin-top: 16px; }
  .merge-field { color: #0066FF; font-weight: 600; }
  .footer { margin-top: 48px; font-size: 9pt; color: #666; text-align: center; border-top: 1px solid #ddd; padding-top: 12px; }
  .page-break { page-break-after: always; }
  @media print { body { padding: 0.5in 0.75in; } }
`;

// ---------------------------------------------------------------------------
// NDA / Confidentiality Agreement — Default Template
// ---------------------------------------------------------------------------

export const DEFAULT_NDA_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Non-Disclosure and Confidentiality Agreement</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <h1>Non-Disclosure and Confidentiality Agreement</h1>
  <p class="subtitle">{{fund_name}}</p>

  <p>This Non-Disclosure and Confidentiality Agreement (this "<strong>Agreement</strong>") is entered into as of <strong>{{date}}</strong> by and between:</p>

  <div class="section indent">
    <p><strong>Disclosing Party:</strong> {{gp_entity}}, a limited partnership organized under the laws of the State of Wyoming, acting as the General Partner of {{fund_name}} (the "<strong>Fund</strong>"); and</p>
    <p><strong>Receiving Party:</strong> {{investor_name}} (the "<strong>Recipient</strong>").</p>
  </div>

  <p>The Disclosing Party and Receiving Party are each referred to herein individually as a "<strong>Party</strong>" and collectively as the "<strong>Parties</strong>."</p>

  <h2>1. Purpose</h2>
  <div class="section">
    <p>The Disclosing Party wishes to share certain confidential and proprietary information with the Recipient for the sole purpose of evaluating a potential investment in the Fund (the "<strong>Purpose</strong>"). This Agreement sets forth the terms and conditions under which such Confidential Information will be disclosed.</p>
  </div>

  <h2>2. Definition of Confidential Information</h2>
  <div class="section">
    <p>"<strong>Confidential Information</strong>" means all information, in any form or medium, disclosed by the Disclosing Party to the Recipient, whether before or after the date of this Agreement, including but not limited to:</p>
    <div class="indent">
      <p>(a) Business plans, financial projections, fund performance data, investor information, and investment strategies;</p>
      <p>(b) The Private Placement Memorandum, Limited Partnership Agreement, Subscription Agreement, and any supplemental offering materials;</p>
      <p>(c) Trade secrets, proprietary data, operational methods, and market analyses;</p>
      <p>(d) The terms, conditions, and existence of any investment opportunity; and</p>
      <p>(e) Any information identified as "confidential," "proprietary," or words of similar import.</p>
    </div>
  </div>

  <h2>3. Obligations of the Recipient</h2>
  <div class="section">
    <p>The Recipient agrees to:</p>
    <div class="indent">
      <p>(a) Hold and maintain all Confidential Information in strict confidence;</p>
      <p>(b) Not disclose any Confidential Information to any third party without the prior written consent of the Disclosing Party;</p>
      <p>(c) Use the Confidential Information solely for the Purpose;</p>
      <p>(d) Protect the Confidential Information with at least the same degree of care used to protect its own confidential information, but in no event less than reasonable care; and</p>
      <p>(e) Promptly notify the Disclosing Party of any unauthorized disclosure or use of the Confidential Information.</p>
    </div>
  </div>

  <h2>4. Exclusions</h2>
  <div class="section">
    <p>The obligations of confidentiality shall not apply to information that: (a) is or becomes publicly available through no fault of the Recipient; (b) was known to the Recipient prior to disclosure; (c) is independently developed by the Recipient without use of Confidential Information; or (d) is disclosed pursuant to a valid order of a court or governmental body, provided that the Recipient gives prior written notice to the Disclosing Party.</p>
  </div>

  <h2>5. Return of Materials</h2>
  <div class="section">
    <p>Upon written request of the Disclosing Party or upon termination of discussions regarding a potential investment, the Recipient shall promptly return or destroy all copies of the Confidential Information and certify such return or destruction in writing.</p>
  </div>

  <h2>6. Term</h2>
  <div class="section">
    <p>This Agreement shall remain in effect for a period of two (2) years from the date first written above, or until the Recipient invests in the Fund (at which point the Limited Partnership Agreement shall govern confidentiality obligations), whichever occurs first.</p>
  </div>

  <h2>7. Governing Law</h2>
  <div class="section">
    <p>This Agreement shall be governed by and construed in accordance with the laws of the State of Wyoming, without regard to its conflicts of law principles.</p>
  </div>

  <h2>8. Miscellaneous</h2>
  <div class="section">
    <p>This Agreement constitutes the entire agreement between the Parties concerning the subject matter hereof and supersedes all prior agreements, understandings, and communications. This Agreement may not be modified except by a written instrument signed by both Parties. No failure or delay in exercising any right under this Agreement shall constitute a waiver of that right.</p>
  </div>

  <div class="signature-block">
    <p><strong>IN WITNESS WHEREOF</strong>, the Parties have executed this Agreement as of the date first written above.</p>

    <table style="width: 100%; margin-top: 32px;">
      <tr>
        <td style="width: 48%; vertical-align: top;">
          <p><strong>DISCLOSING PARTY:</strong></p>
          <p>{{gp_entity}}</p>
          <div class="sig-line"></div>
          <p class="sig-label">Authorized Signatory</p>
          <div class="date-line">
            <p class="sig-label">Date: {{date}}</p>
          </div>
        </td>
        <td style="width: 4%;"></td>
        <td style="width: 48%; vertical-align: top;">
          <p><strong>RECEIVING PARTY:</strong></p>
          <p>{{investor_name}}</p>
          <div class="sig-line"></div>
          <p class="sig-label">Signature</p>
          <p class="sig-label">Name: {{investor_name}}</p>
          <div class="date-line">
            <p class="sig-label">Date: {{date}}</p>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <p>This document was generated by FundRoom — secure fund operations platform.</p>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Subscription Agreement — Default Template
// ---------------------------------------------------------------------------

export const DEFAULT_SUBSCRIPTION_AGREEMENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Subscription Agreement</title>
  <style>${SHARED_STYLES}
    .rep-list { margin-left: 24px; }
    .rep-list li { margin-bottom: 8px; }
    .amount-box { border: 1px solid #000; padding: 12px 16px; margin: 16px 0; background: #fafafa; }
  </style>
</head>
<body>
  <h1>Subscription Agreement</h1>
  <p class="subtitle">{{fund_name}}</p>

  <p>This Subscription Agreement (this "<strong>Agreement</strong>") is entered into as of <strong>{{date}}</strong> by and between {{gp_entity}}, as General Partner of {{fund_name}} (the "<strong>Fund</strong>"), and the undersigned subscriber (the "<strong>Subscriber</strong>").</p>

  <h2>1. Subscription</h2>
  <div class="section">
    <p>The Subscriber hereby subscribes for limited partnership interests (the "<strong>Interests</strong>") in the Fund in the amount set forth below:</p>
    <div class="amount-box">
      <p><strong>Subscriber Name:</strong> {{investor_name}}</p>
      <p><strong>Entity (if applicable):</strong> {{investor_entity}}</p>
      <p><strong>Capital Commitment:</strong> {{investment_amount}}</p>
      <p><strong>Number of Units:</strong> {{commitment_units}}</p>
    </div>
    <p>The Subscriber understands that this subscription is subject to acceptance by the General Partner in its sole discretion.</p>
  </div>

  <h2>2. Payment</h2>
  <div class="section">
    <p>The Subscriber shall fund the Capital Commitment in accordance with the capital call procedures set forth in the Limited Partnership Agreement. The initial capital contribution shall be made by wire transfer to the account designated by the General Partner within fifteen (15) business days of the acceptance of this subscription.</p>
  </div>

  <h2>3. Representations and Warranties of the Subscriber</h2>
  <div class="section">
    <p>The Subscriber hereby represents and warrants to the Fund and the General Partner as follows:</p>
    <ol class="rep-list">
      <li><strong>Accredited Investor Status.</strong> The Subscriber is an "accredited investor" as defined in Rule 501(a) of Regulation D under the Securities Act of 1933, as amended (the "<strong>Securities Act</strong>").</li>
      <li><strong>Investment Purpose.</strong> The Subscriber is acquiring the Interests for investment purposes only and not with a view to distribution or resale.</li>
      <li><strong>Sophistication.</strong> The Subscriber has such knowledge and experience in financial and business matters that the Subscriber is capable of evaluating the merits and risks of an investment in the Fund.</li>
      <li><strong>Risk Acknowledgment.</strong> The Subscriber understands that an investment in the Fund involves a high degree of risk, including the possible loss of the entire investment, and the Subscriber can bear the economic risk of such investment.</li>
      <li><strong>Restricted Securities.</strong> The Subscriber understands that the Interests have not been registered under the Securities Act or any state securities laws and are "restricted securities" that cannot be sold, transferred, or otherwise disposed of without registration or an exemption from registration.</li>
      <li><strong>Access to Information.</strong> The Subscriber has received, reviewed, and understands the Private Placement Memorandum, the Limited Partnership Agreement, and all supplemental materials provided by the General Partner. The Subscriber has had an opportunity to ask questions and receive answers regarding the Fund and its operations.</li>
      <li><strong>No General Solicitation.</strong> The Subscriber was not induced to invest by any form of general solicitation or general advertising within the meaning of Rule 502(c) of Regulation D.</li>
      <li><strong>Anti-Money Laundering.</strong> The funds used by the Subscriber to acquire the Interests are not derived from illegal activities. The Subscriber is not a "Specially Designated National" or "Blocked Person" as designated by the U.S. Department of the Treasury's Office of Foreign Assets Control (OFAC).</li>
      <li><strong>Tax Identification.</strong> The Subscriber has provided a valid taxpayer identification number and consents to the Fund's issuance of Schedule K-1 and other required tax documents.</li>
      <li><strong>Independent Advice.</strong> The Subscriber has had the opportunity to consult with independent legal, tax, and financial advisors regarding this investment and has made an independent decision to invest.</li>
    </ol>
  </div>

  <h2>4. Subscriber Information</h2>
  <div class="section">
    <div class="amount-box">
      <p><strong>Legal Name:</strong> {{investor_name}}</p>
      <p><strong>Entity Type:</strong> {{entity_type}}</p>
      <p><strong>Tax ID:</strong> {{tax_id}}</p>
      <p><strong>Email:</strong> {{email}}</p>
      <p><strong>Address:</strong> {{address}}</p>
    </div>
  </div>

  <h2>5. Limited Partnership Agreement</h2>
  <div class="section">
    <p>By executing this Subscription Agreement, the Subscriber agrees to be bound by the terms and conditions of the Limited Partnership Agreement of the Fund, as may be amended from time to time. The Subscriber acknowledges that the Subscriber has received and reviewed the Limited Partnership Agreement and agrees to all of its terms and provisions.</p>
  </div>

  <h2>6. Indemnification</h2>
  <div class="section">
    <p>The Subscriber agrees to indemnify and hold harmless the Fund, the General Partner, and their respective affiliates, officers, directors, employees, and agents from and against any and all losses, damages, liabilities, and expenses arising out of or resulting from any breach of any representation, warranty, or agreement made by the Subscriber in this Agreement.</p>
  </div>

  <h2>7. Governing Law</h2>
  <div class="section">
    <p>This Agreement shall be governed by and construed in accordance with the laws of the State of Wyoming, without regard to its conflicts of law principles. Any dispute arising out of or relating to this Agreement shall be resolved by binding arbitration in accordance with the rules of the American Arbitration Association.</p>
  </div>

  <h2>8. Miscellaneous</h2>
  <div class="section">
    <p>This Agreement, together with the Limited Partnership Agreement and the Private Placement Memorandum, constitutes the entire agreement between the parties with respect to the subject matter hereof. This Agreement may be executed in counterparts, each of which shall be deemed an original. Electronic signatures shall be deemed valid and binding.</p>
  </div>

  <div class="page-break"></div>

  <h2>Signature Page</h2>

  <div class="signature-block">
    <p><strong>IN WITNESS WHEREOF</strong>, the Subscriber has executed this Subscription Agreement as of the date first written above.</p>

    <table style="width: 100%; margin-top: 32px;">
      <tr>
        <td style="width: 48%; vertical-align: top;">
          <p><strong>SUBSCRIBER:</strong></p>
          <div class="sig-line"></div>
          <p class="sig-label">Signature</p>
          <p class="sig-label">Name: {{investor_name}}</p>
          <p class="sig-label">Title: {{signatory_title}}</p>
          <p class="sig-label">Date: {{date}}</p>
        </td>
        <td style="width: 4%;"></td>
        <td style="width: 48%; vertical-align: top;">
          <p><strong>ACCEPTED BY THE GENERAL PARTNER:</strong></p>
          <p>{{gp_entity}}</p>
          <div class="sig-line"></div>
          <p class="sig-label">Authorized Signatory</p>
          <p class="sig-label">Date: {{date}}</p>
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <p>This document was generated by FundRoom — secure fund operations platform.</p>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Template registry — maps document types to their default HTML content
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATE_REGISTRY: Record<string, {
  label: string;
  description: string;
  htmlContent: string;
  mergeFields: string[];
  isRequired: boolean;
  numPages: number;
}> = {
  NDA: {
    label: "NDA / Confidentiality Agreement",
    description: "Non-disclosure agreement protecting fund confidential information during the investment evaluation period.",
    htmlContent: DEFAULT_NDA_HTML,
    mergeFields: ["investor_name", "investor_entity", "fund_name", "gp_entity", "date"],
    isRequired: false,
    numPages: 3,
  },
  SUBSCRIPTION: {
    label: "Subscription Agreement",
    description: "Subscription agreement for limited partnership interests including SEC representations and investor information.",
    htmlContent: DEFAULT_SUBSCRIPTION_AGREEMENT_HTML,
    mergeFields: ["investor_name", "investor_entity", "investment_amount", "fund_name", "gp_entity", "date", "commitment_units", "entity_type", "tax_id", "email", "address", "signatory_title"],
    isRequired: true,
    numPages: 5,
  },
};
