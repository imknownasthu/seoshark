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

// Schema goi y noi dung UNIQUE (non-commodity) cho tung heading
export const UNIQUE_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: "Heading trong outline nên thêm yếu tố unique" },
          what: { type: "string", description: "Yếu tố unique/non-commodity cụ thể nên thêm (rút từ kiến thức website)" },
          how: { type: "string", description: "Cách lồng vào heading đó cho tự nhiên" },
        },
        required: ["heading", "what", "how"],
      },
    },
  },
  required: ["suggestions"],
};

// Prompt goi y noi dung UNIQUE: chi cho heading PHU HOP, rut tu kien thuc website
export function buildUniquePrompt({ mainKw, subKws = [], websiteName = "", knowledge = "", outline = [] }) {
  const system =
    "Bạn là chuyên gia SEO content chiến lược, đa lĩnh vực. Nhiệm vụ: dựa trên OUTLINE đã chốt và KIẾN THỨC WEBSITE, " +
    "gợi ý CHÍNH XÁC nên thêm yếu tố NỘI DUNG UNIQUE / NON-COMMODITY (dữ liệu độc quyền, case thật, quan điểm chuyên gia, số liệu cụ thể, USP, thế mạnh riêng) " +
    "vào HEADING NÀO là phù hợp nhất và thêm NHƯ THẾ NÀO, để đáp ứng khung Unique/Specific/Authentic của Google.\n" +
    "NGUYÊN TẮC:\n" +
    "• CHỈ gợi ý cho heading THỰC SỰ phù hợp để lồng kiến thức website đó vào; KHÔNG ép mọi heading, KHÔNG bịa thông tin không có trong kiến thức.\n" +
    "• Mỗi gợi ý phải RÚT từ KIẾN THỨC WEBSITE (điểm khác biệt/thế mạnh/số liệu/quy trình/uy tín cụ thể), không nói chung chung.\n" +
    "• 'what' = yếu tố unique cụ thể; 'how' = cách lồng vào heading tự nhiên (dạng đoạn, bullet, số liệu, câu chốt...).\n" +
    "• Số lượng gợi ý theo mức phù hợp thực tế (thường 2–6), chất lượng hơn số lượng. Nếu kiến thức không đủ để tạo yếu tố unique, trả mảng rỗng.\n" +
    "• Viết cùng ngôn ngữ với từ khóa chính.\n" +
    "Trả JSON {suggestions:[{heading, what, how}]}. 'heading' phải TRÙNG KHỚP một heading trong outline đã cho.";

  const outlineText = (outline || []).map((it) => `${"#".repeat(it.level || 2)} ${it.text || it}`).join("\n");
  const parts = [];
  parts.push(`TỪ KHÓA CHÍNH: ${mainKw}`);
  if (subKws.length) parts.push(`TỪ KHÓA PHỤ: ${subKws.join(", ")}`);
  if (websiteName) parts.push(`WEBSITE: ${websiteName}`);
  parts.push(`KIẾN THỨC WEBSITE (nguồn để rút yếu tố unique):\n${String(knowledge || "").trim().slice(0, 8000)}`);
  parts.push(`OUTLINE ĐÃ CHỐT (chỉ gợi ý cho heading trong đây):\n${outlineText}`);
  parts.push("YÊU CẦU: Gợi ý thêm nội dung unique vào các heading phù hợp nhất (heading phải trùng khớp outline), nêu rõ 'what' và 'how'.");

  return { system, user: parts.join("\n\n"), schema: UNIQUE_SCHEMA };
}

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
    "Bạn là chuyên gia SEO content chiến lược, làm việc ĐA LĨNH VỰC (y tế, TMĐT, bất động sản, giáo dục, du lịch, tài chính, pháp lý, công nghệ, làm đẹp...). " +
    "Nhiệm vụ: từ outline của các đối thủ TOP SERP, TỔNG HỢP ra MỘT outline heading (H2/H3/H4) TỐT NHẤT cho từ khóa chính.\n\n" +
    "⚠️ QUAN TRỌNG: Tự nhận diện ĐÚNG lĩnh vực của từ khóa rồi áp dụng phương pháp cho phù hợp lĩnh vực ĐÓ. " +
    "Các khung dưới đây là PHƯƠNG PHÁP THAM KHẢO tổng quát, KHÔNG mặc định ngành nào.\n\n" +
    "PHƯƠNG PHÁP (chắt lọc, không áp cứng):\n" +
    "• Xác định SEARCH INTENT chủ đạo của từ khóa; toàn bộ cấu trúc phải phục vụ intent đó.\n" +
    "• CHẮT LỌC, KHÔNG GỘP TẤT CẢ: phân tích đối thủ để tạo outline TỐT NHẤT, KHÔNG phải đối thủ có bao nhiêu thì đưa vào bấy nhiêu. " +
    "Chỉ giữ heading THỰC SỰ phục vụ intent và hữu ích cho người đọc; BỎ mục trùng ý, rác, quảng cáo, điều hướng, ngoài lề. Mỗi H2 phải có lý do tồn tại rõ ràng.\n" +
    "• Content gap: chỉ thêm heading nếu nó trả lời thêm một nhu cầu THẬT của người đọc cho từ khóa này (đừng thêm chỉ vì 1 đối thủ có).\n" +
    "• Chất lượng theo Google: E-E-A-T + khung Unique/Specific/Authentic. Nếu có 'Kiến thức website', khéo léo lồng điểm khác biệt/thế mạnh vào heading phù hợp để đi hướng NON-COMMODITY (không chung chung như mọi bài). Nếu không có, vẫn giữ outline hữu ích, không bịa.\n" +
    "• Trình bày rõ ràng phục vụ NGƯỜI ĐỌC (không nhồi nhét, không chunking hình thức cho AI).\n\n" +
    "QUY TẮC CẤU TRÚC HEADING (BẮT BUỘC):\n" +
    "1. Phân cấp đúng: H3 nằm trong H2, H4 nằm trong H3. Chỉ dùng H4 khi thật cần.\n" +
    "2. Mỗi heading cha có 0 HOẶC ≥2 con — TUYỆT ĐỐI KHÔNG để 1 H2 chỉ có đúng 1 H3, hay 1 H3 chỉ có đúng 1 H4. Nếu chỉ có 1 ý con, đừng tạo heading con lẻ (để nội dung đó nằm trong phần cha).\n" +
    "3. VIẾT HOA kiểu 'sentence case': chỉ viết hoa CHỮ CÁI ĐẦU heading và TÊN RIÊNG/thương hiệu/từ viết tắt (VD: Invisalign, Google, iPhone). KHÔNG viết hoa mọi từ, KHÔNG VIẾT HOA TOÀN BỘ.\n" +
    "4. KHÔNG dùng dấu gạch ngang (-, –, —) để giải thích/bổ nghĩa trong heading. Dùng dấu phẩy, hai chấm hoặc viết lại.\n" +
    "5. Heading NÊN chứa từ khóa chính hoặc từ khóa phụ khi TỰ NHIÊN (không gượng ép, không nhồi).\n" +
    "6. SỐ LƯỢNG heading do search intent quyết định — bài đơn giản thì ít, phức tạp thì nhiều; không ép con số.\n" +
    "7. Nếu có 'Outline tham khảo', ưu tiên đưa các heading đó vào (nếu hợp lý) và đặt đúng vị trí.\n" +
    "8. Viết cùng NGÔN NGỮ với từ khóa chính. Chỉ trả OUTLINE HEADING, không viết nội dung.\n\n" +
    "Trả JSON {outline:[{level, text}]} theo đúng thứ tự đọc từ trên xuống (level = 2|3|4).";

  const parts = [];
  parts.push(`TỪ KHÓA CHÍNH: ${mainKw}`);
  if (subKws.length) parts.push(`TỪ KHÓA PHỤ: ${subKws.join(", ")}`);
  if (websiteName) parts.push(`WEBSITE cần soạn: ${websiteName}`);
  if (refOutline && String(refOutline).trim()) parts.push(`OUTLINE THAM KHẢO (heading mong muốn của người dùng):\n${String(refOutline).trim()}`);
  if (knowledge && String(knowledge).trim()) parts.push(`KIẾN THỨC WEBSITE (dùng để đi đúng hướng non-commodity, KHÔNG nhồi chi tiết vào heading):\n${String(knowledge).trim().slice(0, 6000)}`);
  parts.push(`OUTLINE CÁC ĐỐI THỦ TOP SERP (phân tích kỹ làm CĂN CỨ, nhưng CHẮT LỌC chứ không copy toàn bộ):\n${competitorsBlock(competitorOutlines)}`);
  parts.push(
    "YÊU CẦU: Xuất outline cuối cùng (H2/H3/H4) TỐT NHẤT cho từ khóa chính — chắt lọc heading thiết yếu, đúng search intent, " +
    "tuân thủ mọi QUY TẮC CẤU TRÚC ở trên (đặc biệt: cha có 0 hoặc ≥2 con; sentence case; không gạch ngang)."
  );

  return { system, user: parts.join("\n\n"), schema: OUTLINE_SCHEMA };
}
