const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  },
});

const htmlResponse = (body, status = 200) => new Response(body, {
  status,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
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

const formatSummary = (data) => {
  if (!data?.shipment) return '';
  const { company, arrivalDate, vesselOrFlight, loadPort, dischargePort, masterBL, cargoNumber } = data.shipment;
  return `
    <div class="width-con">
      <div class="info cc-company">
        <div class="info-title">통관업체</div>
        <div>${company?.name ?? ''}</div>
        <div><a href="tel:${company?.phone ?? ''}"></a>${company?.phone ?? ''}</div>
      </div>
      <div class="info">
        <div class="info-title">입항일</div>
        <div>${arrivalDate ?? ''}</div>
      </div>
      <div class="info">
        <div class="info-title">선박/항공편명</div>
        <div>${vesselOrFlight ?? ''}</div>
      </div>
      <div class="info">
        <div class="info-title">적재항</div>
        <div>${loadPort ?? ''}</div>
      </div>
      <div class="info">
        <div class="info-title">양륙항</div>
        <div>${dischargePort ?? ''}</div>
      </div>
    </div>
    <div class="width-con">
      <div class="info">
        <div class="info-title">Master BL :</div>
        <div title="복사 기능 없음">${masterBL ?? ''}</div>
      </div>
      <div class="info">
        <div class="info-title">화물관리번호 :</div>
        <div title="복사 기능 없음">${cargoNumber ?? ''}</div>
      </div>
    </div>
  `;
};

const buildEvent = (event) => `
  <div class="content">
    <div class="dot-box">
      <div class="dot"></div>
    </div>
    <div class="state-box">
      <div class="time-text">
        <span class="location">${event.location ?? ''}</span>
        <span class="time-info">${(event.dateTime ?? '').split('T')[1]?.slice(0,5) ?? ''}</span>
      </div>
      <div class="msg-text">
        <div>
          <p class="msg">${event.status ?? ''}</p>
          <p class="sub-msg">${event.detail ?? ''}</p>
        </div>
        <div class="company-text">
          <span>${event.carrier ?? ''}</span>
        </div>
      </div>
    </div>
  </div>
`;

const buildTimeline = (tracks = []) => {
  const sorted = [...tracks].sort((a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0));
  if (!sorted.length) {
    return `
      <div class="content-wrap no-data">
        <div class="width-con">
          <div class="content-no-data">
            <div>화물이 출고된 내역이 없습니다.</div>
          </div>
        </div>
      </div>
    `;
  }
  const groups = sorted.reduce((acc, ev) => {
    const date = (ev.dateTime ?? '').split('T')[0] ?? '';
    if (!acc[date]) acc[date] = [];
    acc[date].push(ev);
    return acc;
  }, {});
  const entries = Object.entries(groups).sort(([a], [b]) => new Date(b) - new Date(a));
  return entries.map(([date, events], idx) => {
    // 각 날짜 그룹 내 이벤트들도 시간순으로 정렬 (최신이 위로)
    events.sort((a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0));
    return `
    <div class="content-wrap" ${idx === 0 ? 'id="state_active"' : ''}>
      <div class="width-con">
        <div class="content-box">
          <p class="date-text"><span>${date}</span></p>
          ${events.map(buildEvent).join('')}
        </div>
      </div>
    </div>
  `}).join('');
};

const buildFullPage = (data) => {
  const summaryHtml = formatSummary(data);
  const timelineHtml = buildTimeline(data?.shipment?.tracks ?? []);

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>화물 추적</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: white;
            min-height: 100vh;
        }

        .summary {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .timeline {
            background: white;
        }

        .width-con {
            max-width: 100%;
        }

        .info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }

        .info:last-child {
            border-bottom: none;
        }

        .info-title {
            font-weight: 600;
            color: #666;
            flex: 1;
        }

        .cc-company .info-title {
            color: #007bff;
        }

        .content-wrap {
            margin-bottom: 20px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .content-wrap.no-data {
            text-align: center;
            padding: 40px;
            background: #f8f9fa;
        }

        .content-no-data {
            color: #666;
            font-size: 16px;
        }

        .content-box {
            padding: 20px;
        }

        .date-text {
            font-size: 18px;
            font-weight: 600;
            color: #007bff;
            margin-bottom: 15px;
        }

        .content {
            display: flex;
            align-items: flex-start;
            padding: 15px 0;
            border-bottom: 1px solid #f0f0f0;
        }

        .content:last-child {
            border-bottom: none;
        }

        .dot-box {
            flex-shrink: 0;
            margin-right: 15px;
        }

        .dot {
            width: 12px;
            height: 12px;
            background: #007bff;
            border-radius: 50%;
            margin-top: 6px;
        }

        .state-box {
            flex: 1;
        }

        .time-text {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .location {
            font-weight: 600;
            color: #333;
        }

        .time-info {
            color: #666;
            font-size: 14px;
        }

        .msg-text {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .msg {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .sub-msg {
            color: #666;
            font-size: 14px;
        }

        .company-text {
            text-align: right;
            color: #666;
            font-size: 14px;
        }

        a {
            color: #007bff;
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="summary">
            ${summaryHtml}
        </div>
        <div class="timeline">
            ${timelineHtml}
        </div>
    </div>
</body>
</html>
  `;
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

    return htmlResponse(buildFullPage(payload));
  },
};

