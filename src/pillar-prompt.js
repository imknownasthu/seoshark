// src/pillar-prompt.js
// Prompt + schema cho tinh nang "Nghien cuu Pillar Topic":
//  - buildClassifyPrompt: phan nhom tu khoa theo topic (theo lo, nhat quan topic; kem dich VI neu can)
//  - buildSuggestPrompt: goi y >=20 tu khoa MOI/topic (khong trung ngu nghia; kem dich VI neu can)

export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          topic: { type: "string", description: "Tên nhóm chủ đề ngắn gọn, nhất quán" },
          vi: { type: "string", description: "Bản dịch tiếng Việt (nếu từ khóa là tiếng Anh); để trống nếu vốn là tiếng Việt" },
        },
        required: ["keyword", "topic"],
      },
    },
  },
  required: ["items"],
};

export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          keywords: {
            type: "array",
            items: {
              type: "object",
              properties: {
                keyword: { type: "string" },
                vi: { type: "string", description: "Bản dịch tiếng Việt (nếu từ khóa tiếng Anh); để trống nếu tiếng Việt" },
              },
              required: ["keyword"],
            },
            description: "Từ khóa MỚI (>=20), không trùng ngữ nghĩa với từ khóa đã có",
          },
        },
        required: ["topic", "keywords"],
      },
    },
  },
  required: ["topics"],
};

// keywords: [{keyword, topic?}]; opts: { knownTopics:[], needTranslate:bool }
export function buildClassifyPrompt(keywords, { knownTopics = [], needTranslate = false } = {}) {
  const system =
    "Bạn là chuyên gia SEO content strategist, đa lĩnh vực. Nhiệm vụ: PHÂN NHÓM (topic / pillar) cho danh sách từ khóa.\n" +
    "NGUYÊN TẮC:\n" +
    "• Nhóm theo Ý ĐỊNH & CHỦ ĐỀ, KHÔNG theo câu chữ. Các từ khóa ĐỒNG NGHĨA / cùng một ý phải nằm CÙNG 1 topic. " +
    "Ví dụ: 'giá niềng răng', 'chi phí niềng răng', 'niềng răng bao nhiêu tiền' → cùng topic 'Chi phí / Giá'.\n" +
    "• Đặt tên topic NGẮN GỌN, rõ nghĩa và NHẤT QUÁN.\n" +
    "• Nếu từ khóa ĐÃ có topic do người dùng cung cấp: GIỮ NGUYÊN topic đó.\n" +
    (knownTopics.length
      ? "• Có danh sách 'TOPIC ĐÃ CÓ' bên dưới (từ các lô trước): hãy TÁI SỬ DỤNG đúng tên các topic đó cho từ khóa phù hợp; CHỈ tạo topic mới khi từ khóa thực sự không thuộc topic nào đã có. Mục tiêu: NHẤT QUÁN topic giữa các lô.\n"
      : "") +
    (needTranslate
      ? "• Với MỖI từ khóa, thêm trường 'vi' = BẢN DỊCH TIẾNG VIỆT tự nhiên, ngắn gọn, đúng nghĩa. Nếu từ khóa vốn đã là tiếng Việt thì để 'vi' rỗng.\n"
      : "") +
    "• KHÔNG bịa từ khóa mới, phân nhóm ĐÚNG từng từ đã cho. Tên topic cùng ngôn ngữ với từ khóa.\n" +
    "Trả JSON {items:[{keyword, topic" + (needTranslate ? ", vi" : "") + "}]}.";
  const parts = [];
  if (knownTopics.length) parts.push("TOPIC ĐÃ CÓ (tái sử dụng cho nhất quán):\n" + knownTopics.map((t) => "- " + t).join("\n"));
  parts.push("Danh sách từ khóa (từ nào có [topic:...] là người dùng cung cấp, hãy tôn trọng):\n" +
    keywords.map((k) => (k.topic ? `- ${k.keyword}  [topic: ${k.topic}]` : `- ${k.keyword}`)).join("\n"));
  return { system, user: parts.join("\n\n"), schema: CLASSIFY_SCHEMA };
}

// topics: [{ topic, have:[kw...], candidates:[kw...] }]; opts: { minPerTopic, needTranslate }
export function buildSuggestPrompt(topics, { minPerTopic = 30, needTranslate = false } = {}) {
  const system =
    "Bạn là chuyên gia nghiên cứu từ khóa SEO. Nhiệm vụ CHÍNH: từ danh sách 'GỢI Ý AUTOCOMPLETE' (là truy vấn CÓ THẬT của Google) — hãy CHỌN LỌC, LÀM SẠCH và SẮP các từ khóa TỐT NHẤT, ĐA DẠNG NHẤT cho mỗi topic (ÍT NHẤT " + minPerTopic + " từ nếu đủ ứng viên).\n" +
    "TƯ DUY: đây là từ khóa THẬT có người tìm — KHÔNG được 'chế' từ khóa bằng cách lấy TÊN TOPIC/chuyên mục rồi ghép thêm chữ. Chỉ khi ứng viên autocomplete chưa đủ, mới được bổ sung THÊM một ít biến thể long-tail mà bạn CHẮC CHẮN có người tìm (nhu cầu thật), tuyệt đối không bịa cụm gượng ép.\n" +
    "QUY TẮC BẮT BUỘC:\n" +
    "1. TUYỆT ĐỐI KHÔNG trùng và KHÔNG đồng nghĩa / cùng ý với các từ khóa NGƯỜI DÙNG ĐÃ CÓ. Cấm DIỄN ĐẠT LẠI (đổi trật tự, thêm/bớt từ hỏi, đổi từ nối). " +
    "PHÉP THỬ: bỏ các từ hỏi/từ nối (bị, có, không, gây, làm, tại sao, là, được, bao nhiêu...) mà phần nội dung còn lại trùng phần lớn với một từ đã có → LOẠI. " +
    "Ví dụ CẤM: đã có 'giá niềng răng' → KHÔNG gợi 'chi phí niềng răng', 'niềng răng bao nhiêu tiền'.\n" +
    "2. CẤM 'ghép cơ học' kiểu lấy tên topic + 1 tính từ/bổ ngữ chung chung (vd topic 'Niềng răng' → cấm chế 'niềng răng tốt', 'niềng răng đẹp', 'niềng răng uy tín' nếu không phải truy vấn thật). Mỗi từ phải là một TRUY VẤN TỰ NHIÊN như người thật gõ.\n" +
    "3. ĐA DẠNG INTENT: phủ nhiều nhu cầu KHÁC nhau (nguyên nhân, cách xử lý, phòng ngừa, chi phí, đối tượng, thời gian, so sánh, biến chứng, vật liệu/loại, thương hiệu, review, quy trình, độ bền, an toàn...). Các từ gợi ý KHÔNG trùng ý lẫn nhau.\n" +
    "3b. HẠN CHẾ TỪ KHÓA ĐỊA PHƯƠNG: KHÔNG nhồi nhiều biến thể theo địa danh kiểu '... in Turkey', '... in Paris', '... in London', '... near me' — TỐI ĐA 1-2 từ dạng địa điểm mỗi topic. Ưu tiên các truy vấn theo NHU CẦU/CHỦ ĐỀ (không gắn địa danh) để đa dạng ngữ cảnh.\n" +
    "4. Từ khóa gợi ý viết CÙNG ngôn ngữ với từ khóa đã có của topic đó.\n" +
    (needTranslate
      ? "5. Mỗi từ khóa trả object {keyword, vi} với 'vi' = bản dịch tiếng Việt (nếu từ khóa tiếng Anh); nếu tiếng Việt để 'vi' rỗng.\n"
      : "5. Mỗi từ khóa trả object {keyword} (không cần dịch).\n") +
    "Trả JSON {topics:[{topic, keywords:[{keyword" + (needTranslate ? ", vi" : "") + "}]}]} — mỗi topic ÍT NHẤT " + minPerTopic + " từ, dùng ĐÚNG tên topic đã cho.";
  const blocks = topics.map((t) => {
    const have = (t.have || []).slice(0, 50).map((k) => "  • " + k).join("\n");
    const cand = (t.candidates || []).slice(0, 120).map((k) => "  - " + k).join("\n");
    return `### TOPIC: ${t.topic}\nTỪ KHÓA ĐÃ CÓ (KHÔNG gợi lại, kể cả đồng nghĩa):\n${have || "  (không có)"}\nGỢI Ý AUTOCOMPLETE — TRUY VẤN CÓ THẬT, hãy ưu tiên chọn/làm sạch từ đây:\n${cand || "  (không có)"}`;
  }).join("\n\n");
  const user = `Từ các GỢI Ý AUTOCOMPLETE thật ở dưới, chọn lọc & đa dạng hóa ÍT NHẤT ${minPerTopic} từ khóa/topic (KHÔNG chế từ bằng cách ghép vào tên topic):\n\n${blocks}`;
  return { system, user, schema: SUGGEST_SCHEMA };
}
