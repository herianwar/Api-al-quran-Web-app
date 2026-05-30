import Script from "next/script";
import { fetchSeoGlobals } from "@/lib/seo";

/**
 * Injects Google Analytics 4 (gtag.js) and/or Google Tag Manager based on the
 * IDs configured in the admin SEO panel. Renders nothing when neither is set.
 * Server component — the IDs are public by design.
 */
export async function SiteAnalytics() {
  const g = await fetchSeoGlobals();
  const ga = g?.gaMeasurementId?.trim();
  const gtm = g?.gtmId?.trim();
  if (!ga && !gtm) return null;

  return (
    <>
      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga}');`}
          </Script>
        </>
      )}
      {gtm && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}
    </>
  );
}
