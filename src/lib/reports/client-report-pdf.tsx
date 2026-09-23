import "server-only";
import { Document, Page, Text, View, StyleSheet, Svg, Circle } from "@react-pdf/renderer";
import { BRAND } from "@/lib/brand";
import type { ClientFunnelResult } from "./client-funnel";

// Brand hexes from src/app/globals.css — react-pdf can't read CSS custom
// properties, so these are copied literally. Keep them in sync if the
// palette changes.
const BRAND_BLUE = "#064288";
const BRAND_ORANGE = "#f87026";
const BRAND_GREEN = "#76b049";
const INK = "#1a2230";
const MUTED = "#6b7482";
const LINE = "#e2e5ea";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 10 },
  headerText: { marginLeft: 8 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 4,
    padding: 10,
  },
  summaryValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BRAND_BLUE },
  summaryLabel: { fontSize: 8, color: MUTED, marginTop: 2 },
  campaignBlock: { marginBottom: 16, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
  campaignTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  stageRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  stageLabel: { width: 70, fontSize: 9, color: MUTED },
  barTrack: { flex: 1, height: 10, backgroundColor: "#f0f2f5", borderRadius: 2 },
  barFill: { height: 10, backgroundColor: BRAND_BLUE, borderRadius: 2 },
  stageValue: { width: 40, fontSize: 9, textAlign: "right", fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f7f8fa", borderBottomWidth: 1, borderBottomColor: LINE },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  tableCellHeader: { flex: 1, fontSize: 8, color: MUTED, padding: 6, textTransform: "uppercase" },
  tableCell: { flex: 1, fontSize: 9, padding: 6 },
  tableCellRight: { flex: 1, fontSize: 9, padding: 6, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: MUTED },
  footerRule: { borderTopWidth: 1, borderTopColor: LINE, marginBottom: 6 },
});

const CATEGORY_LABEL: Record<string, string> = {
  connected_positive: "Positive",
  connected_neutral: "Neutral",
  connected_negative: "Negative",
  no_contact: "No contact",
  invalid: "Invalid",
  compliance: "Compliance",
};

function Mark() {
  return (
    <Svg width={28} height={28} viewBox="0 0 48 48">
      <Circle cx={18} cy={18} r={9} fill={BRAND_BLUE} />
      <Circle cx={32} cy={16} r={6.5} fill={BRAND_ORANGE} />
      <Circle cx={24} cy={32} r={7.5} fill={BRAND_GREEN} />
    </Svg>
  );
}

function StageBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View style={styles.stageRow}>
      <Text style={styles.stageLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.stageValue}>{value}</Text>
    </View>
  );
}

export function ClientReportDocument({ clientName, rows, dispositions }: ClientFunnelResult) {
  const totalAttempts = dispositions.reduce((sum, d) => sum + d.attempts, 0);
  const distinctCampaigns = new Set(dispositions.map((d) => d.campaign_id)).size;
  const totals = rows.reduce(
    (acc, r) => ({
      loaded: acc.loaded + r.loaded,
      dialable: acc.dialable + r.dialable,
      contacted: acc.contacted + r.contacted,
      qualified: acc.qualified + r.qualified,
      converted: acc.converted + r.converted,
    }),
    { loaded: 0, dialable: 0, contacted: 0, qualified: 0, converted: 0 },
  );
  const conversionRate = totals.loaded > 0 ? `${Math.round((totals.converted / totals.loaded) * 100)}%` : "—";
  const generatedOn = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Document title={`${BRAND.productName} — client report — ${clientName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Mark />
          <View style={styles.headerText}>
            <Text style={styles.title}>{BRAND.productName} — client report</Text>
            <Text style={styles.subtitle}>Aggregate campaign performance. No individual lead data included.</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>Client</Text>
            <Text style={styles.metaValue}>{clientName}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaValue}>{generatedOn}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totals.loaded}</Text>
            <Text style={styles.summaryLabel}>Leads loaded</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totals.contacted}</Text>
            <Text style={styles.summaryLabel}>Contacted</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totals.converted}</Text>
            <Text style={styles.summaryLabel}>Converted</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{conversionRate}</Text>
            <Text style={styles.summaryLabel}>Conversion rate</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={{ color: MUTED }}>No campaigns loaded for this client yet.</Text>
        ) : (
          rows.map((r) => (
            <View key={r.campaign_id} style={styles.campaignBlock} wrap={false}>
              <Text style={styles.campaignTitle}>
                {r.campaign_name} ({r.campaign_code}){r.market ? ` — ${r.market}` : ""}
              </Text>
              <StageBar label="Loaded" value={r.loaded} max={r.loaded} />
              <StageBar label="Dialable" value={r.dialable} max={r.loaded} />
              <StageBar label="Contacted" value={r.contacted} max={r.loaded} />
              <StageBar label="Qualified" value={r.qualified} max={r.loaded} />
              <StageBar label="Converted" value={r.converted} max={r.loaded} />
            </View>
          ))
        )}

        {dispositions.length > 0 && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>
              Agent responses — {totalAttempts} call attempt{totalAttempts === 1 ? "" : "s"}
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                {distinctCampaigns > 1 && <Text style={styles.tableCellHeader}>Campaign</Text>}
                <Text style={[styles.tableCellHeader, { flex: 2 }]}>Response</Text>
                <Text style={styles.tableCellHeader}>Category</Text>
                <Text style={styles.tableCellHeader}>Attempts</Text>
              </View>
              {dispositions.map((d) => (
                <View key={`${d.campaign_id}-${d.disposition_code}`} style={styles.tableRow}>
                  {distinctCampaigns > 1 && <Text style={styles.tableCell}>{d.campaign_code}</Text>}
                  <Text style={[styles.tableCell, { flex: 2 }]}>{d.disposition_label}</Text>
                  <Text style={styles.tableCell}>{CATEGORY_LABEL[d.category] ?? d.category}</Text>
                  <Text style={styles.tableCellRight}>{d.attempts}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <View style={styles.footerRule} />
          <Text>
            {BRAND.productName}, on behalf of {clientName}. This report contains aggregate counts only —
            no lead names, phone numbers, emails, or agent identities are ever included, by design.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
