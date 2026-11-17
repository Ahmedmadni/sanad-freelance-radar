/**
 * Public destination links for platforms whose listings cannot currently be
 * verified as open and Saudi-based by our server collector. They must NOT be
 * counted as working automated sources or silently as zero-job sources.
 *
 * Do not try to bypass CAPTCHAs or login controls: re-enable automated
 * discovery only with a supported feed/API and regression coverage.
 */
export const MANUAL_JOB_SOURCES = [
  {
    name: "مستقل",
    url: "https://mostaql.com/projects",
    note: "المشاريع المعروضة تتطلب مراجعة مكان العمل وحالة التقديم يدوياً",
  },
  {
    name: "خمسات",
    url: "https://khamsat.com/community/requests",
    note: "طلبات المجتمع غير قابلة للتحقق آلياً من السوق السعودي وحالة الطلب",
  },
  {
    name: "بعيد",
    url: "https://baaeed.com/remote-jobs",
    note: "التقديم والبلد المسموح بهما يحتاجان تحققاً من تفاصيل الوظيفة",
  },
] as const;
