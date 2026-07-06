// src/outline-prompt.js
// Prompt + schema cho AI tong hop OUTLINE chuan SEO tu outline cua doi thu top SERP.
// Trung thanh voi phuong phap: bam sat doi thu, khong du thua, khong bia; huong non-commodity.

// Schema: danh sach heading phang, moi item co level (2|3|4) + text.
export const OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    outline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          level: { type: "integer", description: "2, 3 hoac 4 (H2/H3/H4)" },
          text: { type: "string", description: "Nội dung heading" },
        },
        required: ["level", "text"],
      },
    },
  },
  required: ["outline"],
};

function competitorsBlock(competitorOutlines) {
  return (competitorOutlines || [])
    .map((c, i) => {
      const hs = (c.headings || [])
        .filter((h) => h.level >= 2 && h.level <= 4)
        .map((h) => `${"  ".repeat(h.level - 2)}${"#".repeat(h.level)} ${h.text}`)
        .join("\n");
      return `— ĐỐI THỦ ${i + 1} (rank ${c.position || i + 1}): ${c.title || c.url}\n${c.url}\n${hs || "(không lấy được heading)"}`;
    })
    .join("\n\n");
}

export function buildOutlinePrompt({ mainKw, subKws = [], refOutline = "", knowledge = "", websiteName = "", competitorOutlines = [] }) {
  const system =
    "Bạn là chuyên gia SEO content, chuyên lên OUTLINE (dàn ý heading) chuẩn Google cho bài viết. " +
    "Nhiệm vụ: từ outline của các đối thủ TOP đầu SERP, tổng hợp ra MỘT outline tốt nhất cho từ khóa chính. " +
    "NGUYÊN TẮC BẮT BUỘC:\n" +
    "1. BÁM SÁT outline của các đối thủ: chỉ đưa vào các mục (heading) mà đối thủ top đã chứng minh là cần thiết; " +
    "ưu tiên mục xuất hiện ở NHIỀU đối thủ. KHÔNG tự suy diễn, KHÔNG bịa mục không ai có.\n" +
    "2. KHÔNG DƯ THỪA: gộp các heading trùng ý, bỏ mục lặp/không liên quan/quảng cáo/điều hướng.\n" +
    "3. Cấu trúc phân cấp H2 > H3 > H4 hợp lý theo chuẩn SEO (H3 nằm trong H2, H4 nằm trong H3). Chỉ dùng H4 khi thật cần.\n" +
    "4. Heading phải tự nhiên, rõ ràng; heading chính NÊN chứa TỪ KHÓA CHÍNH hoặc TỪ KHÓA PHỤ khi hợp lý (không nhồi nhét gượng ép).\n" +
    "5. Hướng NON-COMMODITY: nếu có 'Kiến thức website', hãy khéo léo đưa các điểm khác biệt/độc quyền/thế mạnh của website vào các heading phù hợp để bài đi đúng định vị, KHÔNG chung chung như mọi bài.\n" +
    "6. Nếu người dùng cung cấp 'Outline tham khảo', hãy ƯU TIÊN đưa các heading đó vào (nếu hợp lý) và sắp xếp đúng vị trí.\n" +
    "7. Viết cùng NGÔN NGỮ với từ khóa chính. Chỉ trả outline heading, KHÔNG viết nội dung chi tiết.\n" +
    "Trả JSON {outline:[{level, text}]} theo đúng thứ tự đọc từ trên xuống.";

  const parts = [];
  parts.push(`TỪ KHÓA CHÍNH: ${mainKw}`);
  if (subKws.length) parts.push(`TỪ KHÓA PHỤ: ${subKws.join(", ")}`);
  if (websiteName) parts.push(`WEBSITE cần soạn: ${websiteName}`);
  if (refOutline && String(refOutline).trim()) parts.push(`OUTLINE THAM KHẢO (heading mong muốn của người dùng):\n${String(refOutline).trim()}`);
  if (knowledge && String(knowledge).trim()) parts.push(`KIẾN THỨC WEBSITE (dùng để đi đúng hướng non-commodity):\n${String(knowledge).trim().slice(0, 6000)}`);
  parts.push(`OUTLINE CỦA CÁC ĐỐI THỦ TOP SERP (phân tích thật kỹ, đây là căn cứ chính):\n${competitorsBlock(competitorOutlines)}`);
  parts.push(
    "YÊU CẦU: Tổng hợp outline cuối cùng (H2/H3/H4) cho từ khóa chính — bám sát đối thủ, không dư thừa, không bịa, " +
    "heading nên chứa từ khóa chính/phụ, đi đúng hướng non-commodity nếu có kiến thức website."
  );

  return { system, user: parts.join("\n\n"), schema: OUTLINE_SCHEMA };
}
