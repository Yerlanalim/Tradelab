export const storageBuckets = {
  reports: "reports",
  exports: "exports",
  assets: "assets",
};

export function buildReportPath(reportId: string) {
  return `reports/${reportId}.pdf`;
}
