import {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document";
import { getBrandFromHost, getBrandName, type BrandKey } from "@/lib/branding/favicon";

interface DocumentProps {
  nonce: string;
  brand: BrandKey;
}

function Document({ nonce, brand }: DocumentProps) {
  const brandName = getBrandName(brand);
  const themeColor = "#059669";
  const iconBase = `/icons/${brand}`;

  return (
    <Html lang="en" className="bg-background" suppressHydrationWarning>
      <Head nonce={nonce}>
        <link rel="manifest" href="/api/branding/manifest" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href={`${iconBase}/favicon-32x32.png`} />
        <link rel="icon" type="image/png" sizes="16x16" href={`${iconBase}/favicon-16x16.png`} />
        <meta name="theme-color" content={themeColor} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={brandName} />
        <link rel="apple-touch-icon" href={`${iconBase}/apple-touch-icon.png`} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content={brandName} />
        <meta name="msapplication-TileColor" content={themeColor} />
        <meta name="msapplication-TileImage" content={`${iconBase}/icon-144x144.png`} />
      </Head>
      <body className="">
        <Main />
        <NextScript nonce={nonce} />
      </body>
    </Html>
  );
}

Document.getInitialProps = async (ctx: DocumentContext) => {
  const initialProps = await ctx.defaultGetInitialProps(ctx);
  const nonce = ctx.req?.headers?.["x-nonce"] as string || "";
  const host = ctx.req?.headers?.host || ctx.req?.headers?.["x-forwarded-host"] as string || "";
  const brand = getBrandFromHost(host);
  return { ...initialProps, nonce, brand };
};

export default Document;
