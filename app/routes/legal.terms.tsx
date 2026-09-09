import { useLoaderData } from "react-router";
import { MERCHANT_TEXT, DPA_VERSION } from "../lib/dpa";
import { dpaEnabled } from "../lib/dpa.server";
export function loader() { return {enabled:dpaEnabled()}; }
export default function MerchantDocument() {
 const {enabled}=useLoaderData<typeof loader>();
 return <main style={{maxWidth:900,margin:"40px auto",padding:"0 24px",lineHeight:1.7}}>
 <h1>Naruto Analytics — Merchant Agreement</h1>
 <p>Version {DPA_VERSION}. {enabled ? "Review the agreement in your Shopify app to accept." : "Draft for review. Not effective and not available for acceptance."}</p>
 <pre style={{whiteSpace:"pre-wrap",fontFamily:"inherit",overflowWrap:"anywhere"}}>{MERCHANT_TEXT}</pre>
 </main>;
}
