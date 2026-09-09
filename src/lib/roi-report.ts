import { formatINR } from "@/lib/constants";

export type ReportRow = {
  handle: string;
  city: string;
  followers: number;
  status: string;
  views: number;
  likes: number;
  comments: number;
  verified: boolean;
  payout: number;
};

export type ReportInput = {
  campaignTitle: string;
  niche: string;
  city: string;
  budget: number;
  payoutPerCreator: number;
  rows: ReportRow[];
};

export function buildReportSummary(input: ReportInput) {
  const paid = input.rows.filter((r) => r.status === "paid");
  const spend = paid.reduce((sum, r) => sum + r.payout, 0);
  const views = input.rows.reduce((sum, r) => sum + r.views, 0);
  const likes = input.rows.reduce((sum, r) => sum + r.likes, 0);
  const comments = input.rows.reduce((sum, r) => sum + r.comments, 0);
  const engagements = likes + comments;
  return {
    creators: input.rows.length,
    paidCreators: paid.length,
    spend,
    views,
    likes,
    comments,
    engagements,
    cpv: views > 0 ? spend / views : 0,
    cpe: engagements > 0 ? spend / engagements : 0,
    engagementRate: views > 0 ? (engagements / views) * 100 : 0,
  };
}

/** Opens a print-ready report window — the browser's print dialog saves it as PDF. */
export function openRoiReport(input: ReportInput) {
  const s = buildReportSummary(input);
  const rows = input.rows
    .map(
      (r) => `<tr>
        <td>@${escapeHtml(r.handle)}${r.verified ? " ✓" : ""}</td>
        <td>${escapeHtml(r.city)}</td>
        <td>${r.followers.toLocaleString("en-IN")}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${r.views.toLocaleString("en-IN")}</td>
        <td>${r.likes.toLocaleString("en-IN")}</td>
        <td>${r.comments.toLocaleString("en-IN")}</td>
        <td>${formatINR(r.payout)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
  <title>${escapeHtml(input.campaignTitle)} — ROI report</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;margin:40px;}
    h1{font-size:22px;margin:0 0 4px;} .sub{color:#6b7280;font-size:13px;margin-bottom:24px;}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;}
    .card{border:1px solid #e5e7eb;border-radius:10px;padding:12px;}
    .card span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
    .card strong{font-size:18px;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;}
    th{color:#6b7280;text-transform:uppercase;font-size:10px;letter-spacing:.04em;}
    footer{margin-top:28px;color:#9ca3af;font-size:11px;}
  </style></head><body>
  <h1>${escapeHtml(input.campaignTitle)}</h1>
  <p class="sub">${escapeHtml(input.niche)} · ${escapeHtml(input.city)} · Report generated ${new Date().toLocaleString("en-IN")}</p>
  <div class="grid">
    <div class="card"><span>Total spend</span><strong>${formatINR(s.spend)}</strong></div>
    <div class="card"><span>Creators paid</span><strong>${s.paidCreators} / ${s.creators}</strong></div>
    <div class="card"><span>Total views</span><strong>${s.views.toLocaleString("en-IN")}</strong></div>
    <div class="card"><span>Engagements</span><strong>${s.engagements.toLocaleString("en-IN")}</strong></div>
    <div class="card"><span>Cost per view</span><strong>${s.cpv.toFixed(2)}</strong></div>
    <div class="card"><span>Cost per engagement</span><strong>${s.cpe.toFixed(2)}</strong></div>
    <div class="card"><span>Engagement rate</span><strong>${s.engagementRate.toFixed(2)}%</strong></div>
    <div class="card"><span>Campaign budget</span><strong>${formatINR(input.budget)}</strong></div>
  </div>
  <table><thead><tr>
    <th>Creator</th><th>City</th><th>Followers</th><th>Status</th><th>Views</th><th>Likes</th><th>Comments</th><th>Payout</th>
  </tr></thead><tbody>${rows || '<tr><td colspan="8">No creators yet</td></tr>'}</tbody></table>
  <footer>AdBridge · figures include creator-reported performance verified by the brand.</footer>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;

  const win = window.open("", "_blank", "noopener,width=1000,height=800");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

export function downloadReportCsv(input: ReportInput) {
  const header = ["Creator", "City", "Followers", "Status", "Views", "Likes", "Comments", "Payout"];
  const lines = input.rows.map((r) =>
    [r.handle, r.city, r.followers, r.status, r.views, r.likes, r.comments, r.payout]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${input.campaignTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-roi.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
