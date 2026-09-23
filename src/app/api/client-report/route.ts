import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadClientFunnel } from "@/lib/reports/client-funnel";
import { ClientReportDocument } from "@/lib/reports/client-report-pdf";
import { BRAND } from "@/lib/brand";

export async function GET(request: NextRequest) {
  const clientIdParam = request.nextUrl.searchParams.get("client");
  const outcome = await loadClientFunnel(clientIdParam);

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  const buffer = await renderToBuffer(ClientReportDocument(outcome.result));
  const filename = `${BRAND.pdfFilenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
