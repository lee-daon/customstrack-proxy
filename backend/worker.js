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
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0,minimum-scale=0,maximum-scale=10">
    <meta name="format-detection" content="telephone=no">
    <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.6/dist/web/variable/pretendardvariable.css" />
    <title>송장 조회</title>
    <style>
:root {
  --purple-color: #7761FB;
}

body {
  margin: 0;
}

p {
  margin: 0;
  padding: 0;
}

.wrap {
  width: 100%;
  height: 100%;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
      -ms-flex-direction: column;
          flex-direction: column;
}

.container {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
      -ms-flex-direction: column;
          flex-direction: column;
  width: 100%;
  height: 100%;
  -webkit-box-sizing: border-box;
          box-sizing: border-box;
}
.container * {
  font-family: "Pretendard Variable";
  font-style: normal;
  font-weight: 500;
  font-size: 14px;
  line-height: 120%;
  letter-spacing: -0.04em;
  color: #373f57;
  -webkit-box-sizing: border-box;
          box-sizing: border-box;
}
.container .width-con {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  width: 100%;
  max-width: 750px;
}

.content_info {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
      -ms-flex-direction: column;
          flex-direction: column;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
  gap: 10px;
  padding: 10px;
  font-size: 14px;
  background: #EAECF2;
}
@media screen and (max-width: 767px) {
  .content_info {
    padding: 16px;
  }
}
.content_info .width-con .info {
  font-size: 14px;
}
.content_info .width-con .info-title {
  font-size: 13px;
}
.content_info .width-con:nth-child(1) {
  gap: 6px;
}
@media screen and (max-width: 767px) {
  .content_info .width-con:nth-child(1) {
    -ms-flex-wrap: wrap;
        flex-wrap: wrap;
    border-radius: 10px;
    background: #FFFFFF;
    gap: 0;
  }
}
.content_info .width-con:nth-child(1) .info {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
      -ms-flex-direction: column;
          flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  font-weight: 500;
  border-radius: 10px;
  background: #FFFFFF;
  -webkit-box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.08);
          box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.08);
}
.content_info .width-con:nth-child(1) .info.cc-company {
  -webkit-box-flex: 0;
      -ms-flex: 0 1 240px;
          flex: 0 1 240px;
}
@media screen and (max-width: 767px) {
  .content_info .width-con:nth-child(1) .info {
    -webkit-box-flex: 1;
        -ms-flex-positive: 1;
            flex-grow: 1;
    -ms-flex-negative: 0;
        flex-shrink: 0;
    -ms-flex-preferred-size: calc(50% - 8px);
        flex-basis: calc(50% - 8px);
    -webkit-box-shadow: unset;
            box-shadow: unset;
  }
  .content_info .width-con:nth-child(1) .info.cc-company {
    -ms-flex-preferred-size: 100%;
        flex-basis: 100%;
  }
}
.content_info .width-con:nth-child(1) .info-title {
  font-weight: 600;
  color: var(--purple-color);
}
.content_info .width-con:nth-child(2) {
  -webkit-box-pack: justify;
      -ms-flex-pack: justify;
          justify-content: space-between;
  gap: 10px;
}
@media screen and (max-width: 767px) {
  .content_info .width-con:nth-child(2) {
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
        -ms-flex-direction: column;
            flex-direction: column;
  }
}
.content_info .width-con:nth-child(2) .info {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-orient: horizontal;
  -webkit-box-direction: normal;
      -ms-flex-direction: row;
          flex-direction: row;
  gap: 6px;
  padding: 0 16px;
}
@media screen and (max-width: 767px) {
  .content_info .width-con:nth-child(2) .info {
    -webkit-box-pack: justify;
        -ms-flex-pack: justify;
            justify-content: space-between;
    padding: 0;
  }
}
.content_info .width-con:nth-child(2) .info .info-title {
  -ms-flex-negative: 0;
      flex-shrink: 0;
}
.content_info .width-con:nth-child(2) .info .copy-info {
  font-weight: 400;
  word-break: break-all;
  text-decoration-line: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.multi-contents {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -ms-flex-wrap: wrap;
      flex-wrap: wrap;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  width: 100%;
  padding: 12px 10px;
  background: #333;
}
.multi-contents .width-con {
  -webkit-box-pack: justify;
      -ms-flex-pack: justify;
          justify-content: space-between;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
  gap: 10px;
}
.multi-contents .width-con > span {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #FFFFFF;
}
.multi-contents .width-con #multi_select {
  -webkit-box-flex: 0;
      -ms-flex: 0 1 240px;
          flex: 0 1 240px;
  padding: 8px 25px 8px 10px;
  min-height: 34px;
  color: #000;
  border: 1px solid #969DAE;
  border-radius: 10px;
  font-family: "Pretendard Variable";
  font-weight: 500;
  font-size: 15px;
  outline: none;
  background-color: #fff;
  background-image: url(/shop/img/btn_expand_more.svg);
  background-position: calc(100% - 10px) center;
  background-size: 11px;
  background-repeat: no-repeat;
  -webkit-appearance: none;
     -moz-appearance: none;
          appearance: none;
  cursor: pointer;
  -webkit-transition: all 125ms linear;
  transition: all 125ms linear;
}
@media (hover: hover) and (pointer: fine) {
  .multi-contents .width-con #multi_select:hover {
    color: var(--purple-color);
    border-color: var(--purple-color);
  }
}
.multi-contents .width-con #multi_select:active, .multi-contents .width-con #multi_select:focus {
  color: var(--purple-color);
  border-color: var(--purple-color);
}
.multi-contents .width-con .ivc-copy {
  font-size: 0;
  cursor: pointer;
}
.multi-contents .width-con .ivc-copy::after {
  content: "";
  display: inline-block;
  width: 18px;
  height: 34px;
  background: url(/shop/img/common/icon_content_copy_969DAE.svg) no-repeat center;
  background-size: contain;
  -webkit-filter: brightness(15);
          filter: brightness(15);
  opacity: 0.6;
  -webkit-transition: all 125ms linear;
  transition: all 125ms linear;
}
@media (hover: hover) and (pointer: fine) {
  .multi-contents .width-con .ivc-copy:hover::after {
    opacity: 1;
  }
}

.content-wrap {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid #E1E5EF;
}
.content-wrap:has(.content-no-data) {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
}
@media screen and (max-width: 767px) {
  .content-wrap {
    padding: 10px;
  }
}
.content-wrap .content-no-data {
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
}
.content-wrap .content-no-data div {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
  font-size: 15px;
  font-weight: 500;
  line-height: 160%;
  text-align: center;
  color: #969DAE;
}
.content-wrap .content-box {
  width: 100%;
  position: relative;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
      -ms-flex-direction: column;
          flex-direction: column;
}
.content-wrap .content-box .date-text {
  padding: 10px 6px;
}
.content-wrap .content-box .date-text span {
  font-size: 14px;
  font-weight: 600;
  color: #969DAE;
}
.content-wrap .content-box .content {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
  -ms-flex-preferred-size: 100px;
      flex-basis: 100px;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: stretch;
      -ms-flex-align: stretch;
          align-items: stretch;
  gap: 6px;
  -webkit-box-sizing: border-box;
          box-sizing: border-box;
}
.content-wrap .content-box .content * {
  color: #969DAE;
}
@media screen and (max-width: 767px) {
  .content-wrap .content-box .content {
    gap: 10px;
  }
  .content-wrap .content-box .content:first-of-type .state-box {
    border: 2px solid #7761FB !important;
  }
}
.content-wrap .content-box .content .dot-box {
  -webkit-box-flex: 0;
      -ms-flex: 0 1 60px;
          flex: 0 1 60px;
  height: 100%;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
  position: relative;
  z-index: 3;
}
@media screen and (max-width: 767px) {
  .content-wrap .content-box .content .dot-box {
    -ms-flex-preferred-size: 40px;
        flex-basis: 40px;
  }
}
.content-wrap .content-box .content .dot-box .dot {
  width: 12px;
  height: 12px;
  margin: 0px 20px;
  border-radius: 50%;
  border: 2px solid #A0A0A0;
  background: #fff;
  position: relative;
  z-index: 3;
}
.content-wrap .content-box .content .dot-box::after {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  -webkit-transform: translate(-50%, 0);
          transform: translate(-50%, 0);
  width: 1px;
  height: 100%;
  background: #BBC1D0;
  z-index: 1;
}
.content-wrap .content-box .content .state-box {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: stretch;
      -ms-flex-align: stretch;
          align-items: stretch;
  gap: 6px;
  margin: 8px 0px;
}
@media screen and (max-width: 767px) {
  .content-wrap .content-box .content .state-box {
    margin: 6px 0;
  }
}
.content-wrap .content-box .content .state-box .time-text {
  -webkit-box-flex: 0;
      -ms-flex: 0 1 120px;
          flex: 0 1 120px;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
      -ms-flex-direction: column;
          flex-direction: column;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
  gap: 6px;
  padding: 20px 10px;
  border: 1px solid #E1E5EF;
  border-radius: 10px;
}
.content-wrap .content-box .content .state-box .time-text .location {
  padding: 0px 8px;
  font-size: 14px;
  font-weight: 600;
  word-break: keep-all;
  overflow-wrap: anywhere;
  text-align: center;
}
.content-wrap .content-box .content .state-box .time-text .time-info {
  font-size: 14px;
  font-weight: 500;
}
.content-wrap .content-box .content .state-box .msg-text {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-orient: horizontal;
  -webkit-box-direction: normal;
      -ms-flex-direction: row;
          flex-direction: row;
  -webkit-box-pack: justify;
      -ms-flex-pack: justify;
          justify-content: space-between;
  gap: 16px;
  padding: 20px 16px;
  -webkit-box-sizing: border-box;
          box-sizing: border-box;
  border: 1px solid #E1E5EF;
  border-radius: 10px;
}
.content-wrap .content-box .content .state-box .msg-text div:nth-child(1) {
  -webkit-box-flex: 1;
      -ms-flex: 1;
          flex: 1;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  -webkit-box-align: start;
      -ms-flex-align: start;
          align-items: flex-start;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
      -ms-flex-direction: column;
          flex-direction: column;
  gap: 6px;
}
.content-wrap .content-box .content .state-box .msg-text div:nth-child(1) .msg {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: justify;
      -ms-flex-pack: justify;
          justify-content: space-between;
  width: 100%;
  font-size: 15px;
  font-weight: 600;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.content-wrap .content-box .content .state-box .msg-text div:nth-child(1) .sub-msg {
  font-size: 14px;
  font-weight: 500;
}
.content-wrap .content-box .content .state-box .msg-text .company-text {
  -webkit-box-flex: 0;
      -ms-flex: 0 0 auto;
          flex: 0 0 auto;
  -ms-flex-item-align: center;
      align-self: center;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  -webkit-box-align: center;
      -ms-flex-align: center;
          align-items: center;
  text-align: center;
  padding: 4px 6px;
  border: 1px solid #969DAE;
  border-radius: 999px;
}
.content-wrap .content-box .content .state-box .msg-text .company-text span {
  font-weight: 600;
  font-size: 13px;
  color: #969DAE;
}
@media screen and (max-width: 767px) {
  .content-wrap .content-box .content .state-box {
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
        -ms-flex-direction: column;
            flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid #E1E5EF;
    border-radius: 10px;
  }
  .content-wrap .content-box .content .state-box .time-text, .content-wrap .content-box .content .state-box .msg-text {
    -webkit-box-flex: unset;
        -ms-flex: unset;
            flex: unset;
    padding: 0;
    border: unset !important;
    -webkit-box-shadow: unset !important;
            box-shadow: unset !important;
  }
  .content-wrap .content-box .content .state-box .time-text {
    -webkit-box-orient: horizontal;
    -webkit-box-direction: normal;
        -ms-flex-direction: row;
            flex-direction: row;
    -webkit-box-pack: justify;
        -ms-flex-pack: justify;
            justify-content: space-between;
  }
  .content-wrap .content-box .content .state-box .time-text .location {
    padding: 0;
    text-align: left !important;
  }
  .content-wrap .content-box .content .state-box .mag-text .msg {
    line-height: 21px;
  }
}
.content-wrap .content-box .content:first-of-type .dot-box::after {
  top: 50%;
  height: 50%;
}
.content-wrap .content-box .content:last-of-type .dot-box::after {
  height: 50%;
}
.content-wrap .content-box .content:first-of-type:nth-last-child(1) .dot-box::after {
  height: 0;
}

.state-icon {
  border: 1px solid #111;
  border-radius: 10px;
  width: 5px;
  height: 5px;
  position: relative;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
}

.h-line {
  width: 1px;
  height: 85px;
  position: absolute;
  background: #111;
}

.content-icon {
  width: 20px;
  height: 20px;
  position: absolute;
  top: 0;
  left: -12px;
  border-radius: 50%;
}

#state_active .content-box .date-text span {
  color: #333;
}
#state_active .content-box .content:nth-child(2) .dot-box .dot {
  border: 2px solid #7761FB !important;
}
#state_active .content-box .content:nth-child(2) .time-text {
  color: #555555;
  gap: 6px;
  border: 2px solid #7761FB;
  background-color: #fff;
  -webkit-box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.08);
          box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.08);
  border-radius: 15px;
}
#state_active .content-box .content:nth-child(2) .time-text .location {
  font-size: 14px;
  font-weight: 600;
  word-break: keep-all;
  text-align: center;
  color: #000;
}
#state_active .content-box .content:nth-child(2) .time-text .time-info {
  color: #4E5968;
}
#state_active .content-box .content:nth-child(2) .msg-text {
  border: 2px solid #7761FB;
  -webkit-box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.08);
          box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.08);
}
#state_active .content-box .content:nth-child(2) .msg-text .msg {
  font-size: 15px;
  font-weight: 700;
  color: #7761FB;
}
#state_active .content-box .content:nth-child(2) .msg-text .sub-msg {
  color: #333333;
}
#state_active .content-box .content:nth-child(2) .msg-text .company-text {
  border: unset;
  background: #7761FB;
}
#state_active .content-box .content:nth-child(2) .msg-text .company-text span {
  color: #FFFFFF;
}

#state_active .content-box .content-icon {
  background: #436edb;
}
#state_active .content-box .date-text {
  color: #7761FB;
}
#state_active .content-box .data-multi-desc {
  font-size: 11px;
  color: #373737;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  text-align: center;
  -webkit-box-pack: center;
      -ms-flex-pack: center;
          justify-content: center;
  -webkit-box-flex: 2;
      -ms-flex: 2;
          flex: 2;
}

.c-red {
  color: #dc4b4b;
}
    </style>
</head>
<body>
    <div class="wrap">
        <div class="container">
            <div class="content_info">
                ${summaryHtml}
            </div>
            <div id="timeline">
                ${timelineHtml}
            </div>
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

