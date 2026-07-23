// src/outline-archetype.js
// NHAN DIEN "DANG CAU TRUC" MA TOP SERP DANG DUNG cho tu khoa.
//
// Cung mot tu khoa nhung Google co the dang thuong MOT DANG BAI cu the: bai TOPLIST (liet ke
// 10 dia chi / 15 cach / 7 loai...), bai HUONG DAN theo buoc, bai SO SANH, bai DANH GIA,
// trang DICH VU (gia + quy trinh + dia chi), hay bai GIAI THICH (la gi / nguyen nhan / dau hieu).
// Neu da so doi thu di theo dang TOPLIST ma minh viet dang giai thich thi outline sai intent
// ngay tu cau truc — du tung heading co dung chu de.
//
// Module nay cham diem TUNG doi thu theo tin hieu tieu de + heading, roi lay dang CHIEM DA SO.

const normVi = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");

// Heading la MOT HANG MUC trong danh sach (vd "1. Nha khoa ABC", "2. Kem chong nang XYZ")
const NUMBERED_RE = /^\s*(\d{1,2})\s*[.)\-–:]\s+\S/;
// Tieu de/heading kieu "Top 10 ...", "15 cach ...", "7 loai ..."
const TOPN_RE = /\b(top|toplist)\s*\d{1,3}\b|\b\d{1,3}\s+(cach|loai|dia chi|mau|kieu|buoc|meo|phuong phap|thuc pham|bai tap|dia diem|thuong hieu|san pham|website|phan mem|app|ung dung|kinh nghiem|luu y|ly do|dau hieu|nguyen nhan|goi y|y tuong)\b/;

const SIGNALS = {
  toplist: [/\btop\b/, /\bliet ke\b/, /\bgoi y\b.*\bdanh sach\b/, /\bdanh sach\b/],
  howto: [/\bcach\b/, /\bhuong dan\b/, /\bbuoc \d/, /\blam the nao\b/, /\bquy trinh\b/, /\bcac buoc\b/, /\bthuc hien\b/],
  compare: [/\bso sanh\b/, /\bvs\b/, /\bnen chon\b/, /\bkhac nhau\b/, /\bhay\b.*\bhon\b/, /\bkhac biet\b/],
  review: [/\bdanh gia\b/, /\breview\b/, /\bco tot khong\b/, /\bco nen\b/, /\bnhan xet\b/, /\bfeedback\b/],
  service: [/\bchi phi\b/, /\bbang gia\b/, /\bgia\b/, /\bbao nhieu tien\b/, /\bdia chi\b/, /\buy tin\b/, /\bquy trinh\b/, /\bcam ket\b/, /\bbao hanh\b/],
  info: [/\bla gi\b/, /\bkhai niem\b/, /\bnguyen nhan\b/, /\bdau hieu\b/, /\btrieu chung\b/, /\btac dung\b/, /\bcong dung\b/, /\bco nen\b/],
};

export const ARCHETYPES = {
  toplist: {
    label: "TOPLIST / LIỆT KÊ",
    guide: (n) =>
      `Bài dạng danh sách: phần thân là CÁC HẠNG MỤC được liệt kê (mỗi hạng mục 1 heading riêng), ` +
      `trung bình khoảng ${n || 8} hạng mục. Outline phải: (1) mở đầu ngắn bằng 1–2 mục khung (tiêu chí lựa chọn / cách chọn / lưu ý), ` +
      `(2) THÂN BÀI là danh sách các hạng mục cụ thể — đặt cùng cấp, đặt tên hạng mục rõ ràng (không đánh số vào text heading), ` +
      `(3) kết bằng 1 mục tổng hợp hoặc FAQ. KHÔNG biến bài thành dạng giải thích khái niệm dài dòng. ` +
      `⚠️ TUYỆT ĐỐI KHÔNG bê nguyên danh sách TÊN THƯƠNG HIỆU/ĐƠN VỊ mà đối thủ đang liệt kê sang outline này — ` +
      `đó là lựa chọn riêng của họ (và thường là đối thủ của website). Hãy đặt hạng mục theo TIÊU CHÍ/NHÓM ` +
      `(vd "Lựa chọn phù hợp với ngân sách thấp", "Lựa chọn cho người cần làm nhanh") hoặc để dạng khung ` +
      `("Lựa chọn 1 …") để người viết tự điền, trừ khi tên cụ thể đã có sẵn trong KIẾN THỨC WEBSITE.`,
  },
  howto: {
    label: "HƯỚNG DẪN THEO BƯỚC",
    guide: () =>
      `Bài dạng hướng dẫn: thân bài đi theo TRÌNH TỰ THỰC HIỆN (chuẩn bị → các bước → sau khi làm → lưu ý/lỗi thường gặp). ` +
      `Các bước đặt cùng cấp, diễn đạt bằng động từ hành động, không xáo trộn thứ tự.`,
  },
  compare: {
    label: "SO SÁNH / LỰA CHỌN",
    guide: () =>
      `Bài dạng so sánh: thân bài xoay quanh CÁC PHƯƠNG ÁN và TIÊU CHÍ đối chiếu (mỗi phương án hoặc mỗi tiêu chí 1 mục), ` +
      `có mục bảng so sánh tổng hợp và mục kết luận "nên chọn cái nào trong trường hợp nào".`,
  },
  review: {
    label: "ĐÁNH GIÁ / REVIEW",
    guide: () =>
      `Bài dạng đánh giá: thân bài gồm trải nghiệm/ưu điểm/nhược điểm/đối tượng phù hợp/giá và kết luận có nên chọn không. ` +
      `Cần thể hiện trải nghiệm thật (E-E-A-T), không chỉ mô tả chung.`,
  },
  service: {
    label: "TRANG DỊCH VỤ (thương mại)",
    guide: () =>
      `Bài dạng trang dịch vụ: thân bài đi theo hành trình khách hàng (vấn đề → giải pháp/phương pháp → quy trình → chi phí → ` +
      `cam kết/bảo hành → địa chỉ/đặt lịch → FAQ). Mục chi phí và quy trình là bắt buộc.`,
  },
  info: {
    label: "GIẢI THÍCH / KIẾN THỨC",
    guide: () =>
      `Bài dạng kiến thức: thân bài đi từ khái niệm → nguyên nhân/dấu hiệu → phân loại → cách xử lý → lưu ý → FAQ.`,
  },
};

// Cham diem 1 doi thu -> tra ve { type, items } (items = so hang muc neu la toplist)
export function scoreCompetitor(c) {
  const title = normVi(c.title || "");
  const heads = (c.headings || []).filter((h) => h && h.text && h.level >= 2 && h.level <= 3);
  const texts = heads.map((h) => normVi(h.text));
  const score = { toplist: 0, howto: 0, compare: 0, review: 0, service: 0, info: 0 };

  // 1) Tin hieu manh nhat: heading DANH SO (1. .. 2. ..) hoac tieu de "Top N ..."
  const numbered = heads.filter((h) => NUMBERED_RE.test(String(h.text).trim())).length;
  if (numbered >= 3) score.toplist += 6;
  else if (numbered === 2) score.toplist += 2;
  if (TOPN_RE.test(title)) score.toplist += 5;
  if (texts.filter((t) => TOPN_RE.test(t)).length >= 1) score.toplist += 2;

  // 2) Tin hieu tu ngu trong tieu de (nang gap doi) va trong heading
  for (const [type, res] of Object.entries(SIGNALS)) {
    for (const re of res) {
      if (re.test(title)) score[type] += 2;
      score[type] += texts.filter((t) => re.test(t)).length;
    }
  }

  // 3) Nhieu H2 "anh em" khong phai muc intent chung -> nghieng ve danh sach
  const h2 = heads.filter((h) => h.level === 2);
  if (h2.length >= 7 && numbered >= 2) score.toplist += 2;

  const type = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return { type: type[1] > 0 ? type[0] : "info", score, items: numbered || h2.length };
}

/**
 * Dang cau truc CHIEM DA SO trong TOP SERP.
 * @returns null neu khong du du lieu, else { type, label, count, nComp, share, avgItems, guide, dominant }
 */
export function detectArchetype(competitors) {
  const comps = (competitors || []).filter((c) => c && c.ok !== false && (c.headings || []).length);
  if (comps.length < 2) return null;

  const per = comps.map(scoreCompetitor);
  const tally = {};
  per.forEach((p) => { tally[p.type] = (tally[p.type] || 0) + 1; });
  const [type, count] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];

  const itemsArr = per.filter((p) => p.type === type).map((p) => p.items).filter((n) => n > 0);
  const avgItems = itemsArr.length ? Math.round(itemsArr.reduce((a, b) => a + b, 0) / itemsArr.length) : 0;
  const share = +(count / comps.length).toFixed(2);

  return {
    type,
    label: ARCHETYPES[type]?.label || type,
    count,
    nComp: comps.length,
    share,
    avgItems,
    // "dominant" = da so ro rang (>=50% va >=2 doi thu) -> moi ep outline di theo
    dominant: share >= 0.5 && count >= 2,
    guide: (ARCHETYPES[type]?.guide || (() => ""))(avgItems),
  };
}

// Dang cua CHINH BAI DANG TOI UU (de biet co dang lech dang voi TOP SERP khong)
export function detectPageArchetype(page) {
  if (!page || !(page.headings || []).length) return null;
  const s = scoreCompetitor({ title: page.title || page.titleTag || "", headings: page.headings });
  return { type: s.type, label: ARCHETYPES[s.type]?.label || s.type, items: s.items };
}

// Khoi mo ta dua vao prompt. `current` = dang cua bai hien tai (chi co o luong Onpage).
export function archetypeView(a, { current = null } = {}) {
  if (!a || !a.dominant) return "";
  const head = `=== DẠNG CẤU TRÚC MÀ TOP SERP ĐANG DÙNG (tự nhận diện từ outline đối thủ) ===
${a.count}/${a.nComp} đối thủ TOP viết bài theo dạng: ${a.label}${a.type === "toplist" && a.avgItems ? ` (trung bình ~${a.avgItems} hạng mục)` : ""}.
⇒ Google đang thưởng DẠNG BÀI này cho từ khóa. Outline cuối PHẢI đi theo đúng dạng cấu trúc đó, không được viết sang dạng khác.
Cách triển khai: ${a.guide}`;
  if (!current) return head;
  return current.type === a.type
    ? `${head}\nBài đang tối ưu HIỆN ĐANG ĐÚNG dạng này (${current.label}) — giữ nguyên khuôn dạng, chỉ tinh chỉnh bên trong.`
    : `${head}\n⚠️ LỆCH DẠNG: bài đang tối ưu hiện ở dạng ${current.label}, trong khi TOP SERP là ${a.label}. ` +
      `Đây là vấn đề LỚN NHẤT của bài — phải TÁI CẤU TRÚC (dùng remove/rewrite/add) để chuyển bài về đúng dạng ${a.label}, ` +
      `không chỉ sửa vặt từng heading. Nêu rõ lý do "lệch dạng bài so với TOP SERP" trong các mục liên quan.`;
}
