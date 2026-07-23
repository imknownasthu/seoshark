// src/outline-prompt.js
// Prompt + schema cho AI tong hop OUTLINE chuan SEO tu outline cua doi thu top SERP.
// Trung thanh voi phuong phap: bam sat doi thu, khong du thua, khong bia; huong non-commodity.

// Schema: Title SEO + Meta description + danh sach heading phang (level 2|3|4 + text).
export const OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "SEO Title 50-60 ký tự, chứa từ khóa chính (ưu tiên đầu)" },
    metaDescription: { type: "string", description: "Meta description 140-160 ký tự, có từ khóa chính + lợi ích + CTA mềm" },
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
  required: ["title", "metaDescription", "outline"],
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
  parts.push(`KIẾN THỨC WEBSITE (nguồn để rút yếu tố unique — đọc ĐẦY ĐỦ):\n${String(knowledge || "").trim().slice(0, 40000)}`);
  parts.push(`OUTLINE ĐÃ CHỐT (chỉ gợi ý cho heading trong đây):\n${outlineText}`);
  parts.push("YÊU CẦU: Gợi ý thêm nội dung unique vào các heading phù hợp nhất (heading phải trùng khớp outline), nêu rõ 'what' và 'how'.");

  return { system, user: parts.join("\n\n"), schema: UNIQUE_SCHEMA };
}

// Gon prompt: toi da 8 doi thu (co outline), moi doi thu toi da 24 heading, cat text dai.
function competitorsBlock(competitorOutlines) {
  return (competitorOutlines || [])
    .filter((c) => (c.headings || []).some((h) => h.level >= 2 && h.level <= 4))
    .slice(0, 8)
    .map((c, i) => {
      const hs = (c.headings || [])
        .filter((h) => h.level >= 2 && h.level <= 4)
        .slice(0, 24)
        .map((h) => `${"  ".repeat(h.level - 2)}${"#".repeat(h.level)} ${String(h.text).slice(0, 120)}`)
        .join("\n");
      return `— ĐỐI THỦ ${i + 1}: ${String(c.title || c.url).slice(0, 100)}\n${hs}`;
    })
    .join("\n\n");
}

export function buildOutlinePrompt({ mainKw, subKws = [], refOutline = "", knowledge = "", websiteName = "", competitorOutlines = [], consensusText = "", archetypeText = "" }) {
  const system =
    "Bạn là chuyên gia SEO content chiến lược, làm việc ĐA LĨNH VỰC (y tế, TMĐT, bất động sản, giáo dục, du lịch, tài chính, pháp lý, công nghệ, làm đẹp...). " +
    "Nhiệm vụ: từ outline của các đối thủ TOP SERP, TỔNG HỢP ra MỘT outline heading (H2/H3/H4) TỐT NHẤT cho từ khóa chính.\n\n" +
    "⚠️ QUAN TRỌNG: Tự nhận diện ĐÚNG lĩnh vực của từ khóa rồi áp dụng phương pháp cho phù hợp lĩnh vực ĐÓ. " +
    "Các khung dưới đây là PHƯƠNG PHÁP THAM KHẢO tổng quát, KHÔNG mặc định ngành nào.\n\n" +
    (archetypeText
      ? "⚠️ LUẬT SỐ 0 — DẠNG CẤU TRÚC BÀI PHẢI KHỚP TOP SERP (quan trọng hơn cả việc chọn từng heading):\n" +
        "• Trong dữ liệu bên dưới có khối 'DẠNG CẤU TRÚC MÀ TOP SERP ĐANG DÙNG'. Google đang thưởng DẠNG BÀI đó cho từ khóa này — outline cuối PHẢI đi theo đúng dạng cấu trúc ấy.\n" +
        "• Sai dạng cấu trúc là sai intent ngay từ gốc: nếu đa số đối thủ viết dạng TOPLIST/LIỆT KÊ mà bạn dựng outline dạng giải thích khái niệm (là gì → nguyên nhân → cách xử lý) thì outline đó KHÔNG dùng được, dù từng heading nghe hợp lý.\n" +
        "• Ngược lại, nếu đa số đối thủ viết dạng hướng dẫn/dịch vụ thì ĐỪNG bẻ bài thành danh sách liệt kê.\n" +
        "• TITLE SEO cũng phải phản ánh đúng dạng bài (vd dạng toplist: 'Top N …' / 'N cách …'; dạng hướng dẫn: 'Cách …'; dạng so sánh: 'A hay B …').\n" +
        "• Trong khuôn dạng đó, vẫn áp dụng đầy đủ các nguyên tắc chắt lọc, cô đọng, GEO và quy tắc cấu trúc heading bên dưới.\n\n"
      : "") +
    (consensusText
      ? "⚠️ LUẬT SỐ 1 — SEARCH INTENT CHUNG THẮNG MỌI THỨ KHÁC:\n" +
        "• Trong phần dữ liệu bên dưới có bảng 'ĐIỂM CHUNG OUTLINE ĐỐI THỦ' — đã gộp đồng nghĩa BẰNG THUẬT TOÁN (không phải suy đoán). Đây là thứ Google đang thưởng cho từ khóa này.\n" +
        "• MỌI cụm ghi [BAT BUOC] PHẢI có mặt trong outline cuối, không được bỏ bất kỳ cụm nào. Bạn được quyền diễn đạt lại cho tự nhiên/hợp giọng bài, gộp 2 cụm rất gần nhau thành 1 heading bao trùm, hoặc đổi cấp H2/H3 — nhưng KHÔNG được bỏ ý.\n" +
        "• KIẾN THỨC WEBSITE là LỚP PHỦ để làm sâu và khác biệt, KHÔNG phải lớp thay thế: dùng nó để làm giàu chính các mục cốt lõi ở trên, cộng thêm TỐI ĐA 2 mục riêng (góc nhìn/dữ liệu độc quyền) đặt SAU các mục cốt lõi. Tuyệt đối không vì cá nhân hóa mà cắt bớt hay đẩy mục cốt lõi xuống dưới.\n" +
        "• THỨ TỰ outline bám 'vị trí TB trong bài đối thủ' (nhỏ → lớn) để đúng hành trình tìm kiếm, trừ khi có lý do logic rõ ràng.\n" +
        "• Cụm ghi [tuy chon] (ít đối thủ có): chỉ thêm khi thật sự phục vụ intent hoặc là thế mạnh riêng của website.\n" +
        "• Nguyên tắc 'CÔ ĐỌNG' bên dưới áp dụng cho phần NGOÀI các cụm [BAT BUOC] — không được lấy lý do cô đọng để cắt mục cốt lõi.\n" +
        "• TRƯỚC KHI TRẢ KẾT QUẢ: tự đối chiếu lại từng cụm [BAT BUOC] với outline vừa dựng — thiếu cụm nào thì bổ sung ngay.\n\n"
      : "") +
    "PHƯƠNG PHÁP (chắt lọc, không áp cứng):\n" +
    "• Xác định SEARCH INTENT chủ đạo của từ khóa; toàn bộ cấu trúc phải phục vụ intent đó.\n" +
    "• LẤY ĐIỂM CHUNG trước: heading (hoặc ý) mà NHIỀU đối thủ TOP cùng có = tín hiệu MẠNH nhất về intent → gần như BẮT BUỘC đưa vào (sau khi gộp đồng nghĩa). Ý chỉ 1 đối thủ có thì cân nhắc kỹ, chỉ giữ nếu thật sự cần cho intent.\n" +
    "• CÔ ĐỌNG là ưu tiên hàng đầu: outline cuối phải NGẮN GỌN, tập trung vào TỪ KHÓA CHÍNH + PHỤ + mấu chốt bài viết. KHÔNG dài dòng, KHÔNG thêm heading cho 'đủ nhiều'. Thà ít heading mà đúng trọng tâm còn hơn nhiều heading lan man.\n" +
    "• Sau khi lấy điểm chung, BỔ SUNG 1-2 heading QUAN TRỌNG mà đa số đối thủ còn thiếu nhưng cần để lên top (đúng intent, tăng E-E-A-T/GEO) — chỉ khi thực sự tạo giá trị.\n" +
    "• CHẮT LỌC MẠNH, TUYỆT ĐỐI KHÔNG COPY 1-1: KHÔNG lấy hợp (union) tất cả heading của đối thủ rồi liệt kê. " +
    "Chọn bộ heading TINH GỌN, tốt nhất — outline cuối thường ÍT heading hơn tổng heading đối thủ cộng lại. Mỗi heading phải 'xứng đáng có mặt' (đúng intent + hữu ích thật + đạt tiêu chí Google). Phân vân thì BỎ.\n" +
    "• HIỂU NGỮ NGHĨA & GỘP heading ĐỒNG NGHĨA/TRÙNG Ý thành DUY NHẤT 1 heading tối ưu (đây là yêu cầu quan trọng nhất). Nhìn Ý ĐỊNH của heading, không nhìn câu chữ. Ví dụ:\n" +
    "   - 'Răng sứ có ưu điểm gì nổi bật?' ≡ 'Ưu nhược điểm của răng sứ' ⇒ chỉ giữ 1 heading (vd 'Ưu, nhược điểm của răng sứ Cercon').\n" +
    "   - 'Khi nào nên bọc răng sứ Cercon?' ≡ 'Trường hợp sử dụng răng sứ Cercon' ⇒ chỉ giữ 1 heading.\n" +
    "   - 'Răng sứ Cercon là gì?' ≡ 'Răng sứ Cercon như thế nào?' ⇒ 1 heading.\n" +
    "   BỎ mục rác, quảng cáo, điều hướng, lặp, ngoài lề, hoặc chỉ 1 đối thủ có mà không thực sự cần.\n" +
    "• TỐI ƯU HƠN ĐỐI THỦ: không chỉ trùng khớp mà phải NHỈNH HƠN — sắp xếp logic theo hành trình người đọc, bổ sung 1–2 mục giá trị mà đa số đối thủ còn thiếu nhưng người đọc thực sự cần (đúng intent), để outline nổi bật và hữu ích hơn.\n" +
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
    "TỐI ƯU GEO / AI OVERVIEW (BẮT BUỘC, mọi lĩnh vực):\n" +
    "G1. HEADING DẠNG CÂU HỎI THEO CHIẾN LƯỢC: ưu tiên đặt heading là CÂU HỎI đúng cách người dùng/AI thực sự tìm kiếm (bám intent & long-tail), nhất là các mục hay được tra dạng câu hỏi (… là gì, … bao nhiêu tiền, … có tốt/đau/an toàn không, … bao lâu, nên chọn loại nào, quy trình thế nào). Cách tiếp cận này lên AI Overview tốt nhất.\n" +
    "G2. KHÔNG ép TẤT CẢ heading thành câu hỏi — mục liệt kê, bảng giá, so sánh, quy trình vẫn để cụm danh từ cho tự nhiên. KẾT HỢP hai dạng hợp lý (đây là mức 'kết hợp chiến lược', không phải hỏi mọi mục).\n" +
    "G3. Có KHỐI FAQ ở gần cuối: 1 H2 'Câu hỏi thường gặp' (hoặc tương đương) + vài H3 là câu hỏi phụ hay gặp chưa được trả lời ở trên.\n" +
    "G4. Ngầm định mỗi heading câu hỏi sẽ được trả lời THẲNG ở câu đầu khi viết nội dung (không cần ghi vào outline). Ưu tiên mục có góc nhìn/dữ liệu riêng (Unique/Specific) hơn là định nghĩa chung chung.\n\n" +
    "NGOÀI OUTLINE, tạo thêm:\n" +
    "• TITLE SEO (title): 50–60 ký tự (tính cả khoảng trắng), CHỨA TỪ KHÓA CHÍNH và ưu tiên đặt ở ĐẦU, hấp dẫn để click, có thể thêm lợi ích/năm nếu phù hợp; sentence/title tự nhiên, KHÔNG dùng dấu gạch ngang để bổ nghĩa.\n" +
    "• META DESCRIPTION (metaDescription): 140–160 ký tự, CHỨA TỪ KHÓA CHÍNH, nêu lợi ích rõ ràng, có CTA mềm, KHÔNG lặp nguyên văn Title.\n\n" +
    "Trả JSON {title, metaDescription, outline:[{level, text}]} — outline theo đúng thứ tự đọc từ trên xuống (level = 2|3|4).";

  const parts = [];
  parts.push(`TỪ KHÓA CHÍNH: ${mainKw}`);
  if (subKws.length) parts.push(`TỪ KHÓA PHỤ: ${subKws.join(", ")}`);
  if (websiteName) parts.push(`WEBSITE cần soạn: ${websiteName}`);
  if (refOutline && String(refOutline).trim()) parts.push(`OUTLINE THAM KHẢO (heading mong muốn của người dùng):\n${String(refOutline).trim()}`);
  if (knowledge && String(knowledge).trim()) parts.push(`KIẾN THỨC WEBSITE (đọc ĐẦY ĐỦ để đi đúng định vị non-commodity, khai thác tối đa thông tin thật; KHÔNG nhồi chi tiết máy móc vào heading):\n${String(knowledge).trim().slice(0, 40000)}`);
  parts.push(`OUTLINE CÁC ĐỐI THỦ TOP SERP (phân tích kỹ làm CĂN CỨ, nhưng CHẮT LỌC chứ không copy toàn bộ):\n${competitorsBlock(competitorOutlines)}`);
  if (archetypeText) parts.push(archetypeText);
  if (consensusText) parts.push(consensusText);
  parts.push(
    "YÊU CẦU: Xuất Title SEO + Meta description + outline (H2/H3/H4) TỐT NHẤT cho từ khóa chính — " +
    (archetypeText ? "ĐÚNG DẠNG CẤU TRÚC mà TOP SERP đang dùng, " : "") +
    "chắt lọc heading thiết yếu, đúng search intent, " +
    (consensusText ? "PHỦ ĐỦ 100% các cụm [BAT BUOC] trong bảng điểm chung, " : "") +
    "tuân thủ mọi QUY TẮC CẤU TRÚC ở trên (đặc biệt: cha có 0 hoặc ≥2 con; sentence case; không gạch ngang; Title 50–60 ký tự; Meta 140–160 ký tự)."
  );

  return { system, user: parts.join("\n\n"), schema: OUTLINE_SCHEMA };
}
