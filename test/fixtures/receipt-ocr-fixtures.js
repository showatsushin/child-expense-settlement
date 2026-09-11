export const receiptOcrFixtures = [
  {
    name: 'convenience-store',
    text: '\u67b6\u7a7a\u30b3\u30f3\u30d3\u30cb\n2026/09/10\n\u3044\u308d\u306f\u3059 100\n\u30b7\u30fc\u30eb\u30d6\u30c3\u30af \uffe5680\n\u5c0f\u5150\u7528\u30de\u30b9\u30af\n480\n\u5408\u8a08 \u00a5 1, 260\n\u304a\u9810\u308a 2,000\n\u304a\u91e3\u308a 740',
    expected: [['\u3044\u308d\u306f\u3059', 100], ['\u30b7\u30fc\u30eb\u30d6\u30c3\u30af', 680], ['\u5c0f\u5150\u7528\u30de\u30b9\u30af', 480]], total: 1260
  },
  {
    name: 'supermarket',
    text: '\u67b6\u7a7a\u30b9\u30fc\u30d1\u30fc\n2026.09.10\n\u725b\u4e73\n198\n\u30d0\u30ca\u30ca\n2\u70b9 x 100\n200\n\u5c0f\u8a08 398\n\u6d88\u8cbb\u7a0e 31\n\u5408\u8a08 429\n\u73fe\u91d1 429',
    expected: [['\u725b\u4e73', 198], ['\u30d0\u30ca\u30ca', 200]], total: 429
  },
  {
    name: 'hospital-shop',
    text: '\u67b6\u7a7a\u75c5\u9662\u58f2\u5e97\n2026-09-10\n\u5c0f\u5150\u7528\u30de\u30b9\u30af 480\n\u98f2\u6599\u6c34\n120\n\u5408\u8a08 600\n\u30ab\u30fc\u30c9 600',
    expected: [['\u5c0f\u5150\u7528\u30de\u30b9\u30af', 480], ['\u98f2\u6599\u6c34', 120]], total: 600
  },
  {
    name: 'drugstore-discount',
    text: '\u67b6\u7a7a\u85ac\u5c40\n2026/09/10\n\u4ecb\u52a9\u7528\u54c1 500\n\u5024\u5f15 -50\n\u885b\u751f\u7528\u54c1 300\n\u5408\u8a08 750\n\u73fe\u91d1 750',
    expected: [['\u4ecb\u52a9\u7528\u54c1', 450], ['\u885b\u751f\u7528\u54c1', 300]], total: 750
  },
  {
    name: 'hundred-yen-store',
    text: '\u67b6\u7a7a100\u5186\u5e97\n2026/09/10\n\u53ce\u7d0d\u888b 110\n\u7d19\u30b3\u30c3\u30d7\n110\n\u5408\u8a08 220\n\u73fe\u91d1 220',
    expected: [['\u53ce\u7d0d\u888b', 110], ['\u7d19\u30b3\u30c3\u30d7', 110]], total: 220
  },
  {
    name: 'restaurant',
    text: '\u67b6\u7a7a\u98df\u5802\n2026/09/10\n\u304a\u306b\u304e\u308a 180\n\u304a\u8336\n120\n\u5c0f\u8a08 300\n\u5185\u7a0e 27\n\u5408\u8a08 300\n\u73fe\u91d1 300',
    expected: [['\u304a\u306b\u304e\u308a', 180], ['\u304a\u8336', 120]], total: 300
  }
];