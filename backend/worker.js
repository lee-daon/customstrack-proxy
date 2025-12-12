const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  },
});

const sliceBetween = (text, start, end) => {
  const startIdx = text.indexOf(start);
  if (startIdx === -1) return '';
  const from = startIdx + start.length;
  const endIdx = text.indexOf(end, from);
  return text.slice(from, endIdx === -1 ? undefined : endIdx);
};

const extractLabelValue = (html, label) => {
  const regex = new RegExp(`${label}\\s*<\\/span>\\s*<span[^>]*>([^<]*)`, 'i');
  const match = html.match(regex);
  return (match?.[1] || '').trim();
};

const normalizeDateTime = (raw) => {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.includes('T')) return trimmed;
  return `${trimmed.replace(' ', 'T')}:00`;
};

const parseEvents = (sectionHtml, carrier) => {
  const events = [];
  const eventRegex = /<div class="flex gap-3">[\s\S]*?<p class="text-sm font-semibold text-gray-900">\s*([^<]+?)\s*<\/p>[\s\S]*?<span class="text-xs text-gray-500">\s*([^<]*?)\s*<\/span>[\s\S]*?(?:<p class="text-xs text-gray-500[^>]*>\s*([^<]*?)\s*<\/p>)?[\s\S]*?(?:<div class="text-xs text-gray-400[^>]*>\s*([^<]*?)\s*<\/div>)?/gi;
  let match;
  while ((match = eventRegex.exec(sectionHtml)) !== null) {
    const [_, status, location, detail, dateTime] = match;
    events.push({
      dateTime: normalizeDateTime(dateTime),
      location: location.trim(),
      status: status.trim(),
      detail: detail.trim(),
      carrier,
    });
  }
  return events;
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const pathInvoice = url.pathname.replace(/^\/+/, '');
    const invoice = url.searchParams.get('invoice') || pathInvoice;

    if (!invoice) {
      return jsonResponse({ error: 'invoice가 필요합니다.' }, 400);
    }

    const target = `https://www.customstrack.com/${encodeURIComponent(invoice)}`;

    let html;
    try {
      const res = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 customstrack-proxy' },
      });
      if (!res.ok) {
        return jsonResponse({ error: '원본 데이터를 불러오지 못했습니다.' }, res.status);
      }
      html = await res.text();
    } catch (err) {
      return jsonResponse({ error: '데이터 요청 중 오류가 발생했습니다.' }, 502);
    }

    const customsSection = sliceBetween(html, '통관 진행', '배송 진행');
    const deliverySection = sliceBetween(html, '배송 진행', '연락처');
    const contactSection = sliceBetween(html, '연락처', '</body>');
    const customsContact = sliceBetween(contactSection, '통관', '배송');
    const deliveryContact = sliceBetween(contactSection, '배송', '</div>');

  const companyName = extractLabelValue(customsContact, '통관업체') || extractLabelValue(html, '통관업체') || '';
  const companyPhone = extractLabelValue(customsContact, '대표번호') || extractLabelValue(html, '대표번호') || '';
  const deliveryCarrier = extractLabelValue(deliveryContact, '택배사') || extractLabelValue(html, '배송사') || '';
  const deliveryPhone = extractLabelValue(deliveryContact, '대표번호') || extractLabelValue(html, '대표번호') || '';

    const arrivalDate = extractLabelValue(html, '입항일');
    const vesselOrFlight = extractLabelValue(html, '선박/항공편');
    const loadPort = extractLabelValue(html, '적재항');
    const dischargePort = extractLabelValue(html, '양륙항');
    const masterBL = extractLabelValue(html, 'Master BL');
    const cargoNumber = extractLabelValue(html, '화물관리번호');

  const tracks = [
    ...parseEvents(customsSection || html, '관세청'),
    ...parseEvents(deliverySection || html, deliveryCarrier || '배송'),
  ].sort((a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0));

    const payload = {
      shipment: {
        company: { name: companyName, phone: companyPhone || deliveryPhone },
        arrivalDate,
        vesselOrFlight,
        loadPort,
        dischargePort,
        masterBL,
        cargoNumber,
        tracks,
      },
    };

    return jsonResponse(payload);
  },
};

