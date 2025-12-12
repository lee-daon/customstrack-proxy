import { writeFile } from 'fs/promises';

const TARGET = 'https://www.customstrack.com/503535184203';
const HTML_OUTPUT = 'sample-503535184203.html';
const JSON_OUTPUT = 'sample-503535184203.json';

const sliceBetween = (text, start, end) => {
  const startIdx = text.indexOf(start);
  if (startIdx === -1) return '';
  const from = startIdx + start.length;
  const endIdx = text.indexOf(end, from);
  return text.slice(from, endIdx === -1 ? undefined : endIdx);
};

const extractLabelValue = (html, label, pickLast = false) => {
  const regex = new RegExp(`${label}\\s*<\\/span>\\s*<span[^>]*>([^<]*)`, 'gi');
  const matches = [...html.matchAll(regex)];
  if (!matches.length) return '';
  const value = pickLast ? matches[matches.length - 1][1] : matches[0][1];
  return (value || '').trim();
};

const normalizeDateTime = (raw) => {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.includes('T')) return trimmed;
  return `${trimmed.replace(' ', 'T')}:00`;
};

const parseBlockEvents = (html, carrier) => {
  const events = [];
  const statusMatches = [...html.matchAll(/text-sm[^"]*font-semibold[^"]*"[^>]*>\s*([^<]+)/gi)];
  for (let i = 0; i < statusMatches.length; i += 1) {
    const cur = statusMatches[i];
    const next = statusMatches[i + 1];
    const startIdx = cur.index ?? 0;
    const endIdx = next ? next.index : html.length;
    const block = html.slice(startIdx, endIdx);

    const status = (cur[1] || '').trim();
    const spans = [...block.matchAll(/text-xs[^"]*text-gray-500[^"]*"[^>]*>\s*([^<]*)/gi)];
    const location = (spans[0]?.[1] || '').trim();
    const detail = (spans[1]?.[1] || '').trim();
    const dateTime = (block.match(/text-xs[^"]*text-gray-400[^"]*"[^>]*>\s*([^<]*)/i)?.[1] || '').trim();
    if (!status && !location && !detail && !dateTime) continue;
    events.push({
      dateTime: normalizeDateTime(dateTime),
      location,
      status,
      detail,
      carrier: carrier || detectCarrier(status),
    });
  }
  return events;
};

const parseEvents = (html, carrier) => {
  const events = [];
  const eventRegex = /<p class="text-sm[^"]*font-semibold[^"]*"[^>]*>\s*([^<]+?)\s*<\/p>[\s\S]*?<span class="text-xs[^"]*text-gray-500[^"]*"[^>]*>\s*([^<]*?)\s*<\/span>[\s\S]*?<p class="text-xs[^"]*text-gray-500[^"]*mt-1[^"]*"[^>]*>\s*([^<]*?)\s*<\/p>[\s\S]*?<div class="text-xs[^"]*text-gray-400[^"]*"[^>]*>\s*([^<]*?)\s*<\/div>/gi;
  let match;
  while ((match = eventRegex.exec(html)) !== null) {
    const [_, status, location, detail, dateTime] = match;
    const chosenCarrier = carrier || detectCarrier(status);
    events.push({
      dateTime: normalizeDateTime(dateTime),
      location: (location || '').trim(),
      status: (status || '').trim(),
      detail: (detail || '').trim(),
      carrier: chosenCarrier,
    });
  }
  return events;
};

const detectCarrier = (status) => {
  const s = status || '';
  if (/통관|입항|신고|세관/.test(s)) return '관세청';
  return '배송';
};

const parseScriptEvents = (html) => {
  const events = [];

  // HTML에서 직접 이벤트 데이터를 추출 - DOM에 렌더링된 부분 파싱
  // <p class="text-sm font-semibold text-gray-900">상태</p>
  // <span class="text-xs text-gray-500">위치</span>
  // <p class="text-xs text-gray-500 mt-1">상세</p>
  // <div class="text-xs text-gray-400 mt-1">날짜</div>

  const statusMatches = [...html.matchAll(/<p class="text-sm font-semibold text-gray-900">([^<]+)<\/p>/g)];
  const locationMatches = [...html.matchAll(/<span class="text-xs text-gray-500">([^<]*)<\/span>/g)];
  const detailMatches = [...html.matchAll(/<p class="text-xs text-gray-500 mt-1">([^<]*)<\/p>/g)];
  const dateTimeMatches = [...html.matchAll(/<div class="text-xs text-gray-400 mt-1">([^<]*)<\/div>/g)];

  // 각 이벤트는 status, location, detail, dateTime 순서로 나타남
  const eventCount = Math.min(statusMatches.length, locationMatches.length, detailMatches.length, dateTimeMatches.length);

  for (let i = 0; i < eventCount; i++) {
    const status = statusMatches[i][1];
    const location = locationMatches[i][1] || '';
    const detail = detailMatches[i][1] || '';
    const dateTime = dateTimeMatches[i][1] || '';

    if (status && (location || detail || dateTime)) {
      events.push({
        dateTime: normalizeDateTime(dateTime),
        location: location.trim(),
        status: status.trim(),
        detail: detail.trim(),
        carrier: detectCarrier(status),
      });
    }
  }

  return events;
};

const parseAllEvents = (html) => {
  const events = [];
  const blockRegex = /<div class="flex gap-3">[\s\S]*?(?=<div class="flex gap-3">|<\/div>\s*<\/div>)/gi;
  const blocks = html.match(blockRegex) || [];
  for (const block of blocks) {
    const status = (block.match(/text-sm[^"]*font-semibold[^"]*"[^>]*>\s*([^<]+)/i)?.[1] || '').trim();
    const spans = [...block.matchAll(/text-xs[^"]*text-gray-500[^"]*"[^>]*>\s*([^<]*)/gi)];
    const location = (spans[0]?.[1] || '').trim();
    const detail = (spans[1]?.[1] || '').trim();
    const dateTime = (block.match(/text-xs[^"]*text-gray-400[^"]*"[^>]*>\s*([^<]*)/i)?.[1] || '').trim();
    if (!status && !location && !detail && !dateTime) continue;
    events.push({
      dateTime: normalizeDateTime(dateTime),
      location,
      status,
      detail,
      carrier: detectCarrier(status),
    });
  }
  return events;
};

const transformToPayload = (html) => {
  const customsSection = sliceBetween(html, '통관 진행', '배송 진행');
  const deliverySection = sliceBetween(html, '배송 진행', '연락처');
  const contactSection = sliceBetween(html, '연락처', '</body>');

  const companyName = extractLabelValue(contactSection, '통관업체') || extractLabelValue(html, '통관업체') || '';
  const companyPhone = extractLabelValue(contactSection, '대표번호') || extractLabelValue(html, '대표번호') || '';
  const deliveryCarrier = extractLabelValue(contactSection, '택배사') || extractLabelValue(html, '배송사') || '';
  const deliveryPhone = extractLabelValue(contactSection, '대표번호', true) || extractLabelValue(html, '대표번호', true) || '';

  const arrivalDate = extractLabelValue(html, '입항일');
  const vesselOrFlight = extractLabelValue(html, '선박/항공편');
  const loadPort = extractLabelValue(html, '적재항');
  const dischargePort = extractLabelValue(html, '양륙항');
  const masterBL = extractLabelValue(html, 'Master BL');
  const cargoNumber = extractLabelValue(html, '화물관리번호');

  let tracks = parseScriptEvents(html);
  if (!tracks.length) {
    tracks = [
      ...parseBlockEvents(customsSection || html, '관세청'),
      ...parseBlockEvents(deliverySection || html, deliveryCarrier || '배송'),
    ];
  }
  if (!tracks.length) {
    tracks = [
      ...parseEvents(customsSection || html, '관세청'),
      ...parseEvents(deliverySection || html, deliveryCarrier || '배송'),
    ];
  }
  if (!tracks.length) {
    tracks = parseAllEvents(html);
  }
  tracks = tracks.sort((a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0));

  return {
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
};

const fetchHtml = async () => {
  const res = await fetch(TARGET, {
    headers: { 'User-Agent': 'Mozilla/5.0 customstrack-test' },
  });
  if (!res.ok) throw new Error(`fetch 실패: ${res.status} ${res.statusText}`);
  return res.text();
};

const main = async () => {
  const html = await fetchHtml();
  await writeFile(HTML_OUTPUT, html, 'utf8');

  const payload = transformToPayload(html);
  await writeFile(JSON_OUTPUT, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`HTML 저장: ${HTML_OUTPUT}`);
  console.log(`JSON 저장: ${JSON_OUTPUT}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

