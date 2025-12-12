const getInvoice = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('invoice')?.trim() || '';
};

const fetchData = async () => {
  const invoice = getInvoice();
  const url =`https://customstrack-proxy.leedaon480.workers.dev/?invoice=${encodeURIComponent(invoice)}`
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('데이터 불러오기 실패');
    return res.json();
  } catch (err) {
    console.error(err);
    if (invoice) return null;
    try {
      const fallback = await fetch('./base.json', { cache: 'no-cache' });
      if (!fallback.ok) throw new Error('로컬 데이터 불러오기 실패');
      return fallback.json();
    } catch (fallbackErr) {
      console.error(fallbackErr);
      return null;
    }
  }
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
  const entries = Object.entries(groups);
  return entries.map(([date, events], idx) => `
    <div class="content-wrap" ${idx === 0 ? 'id="state_active"' : ''}>
      <div class="width-con">
        <div class="content-box">
          <p class="date-text"><span>${date}</span></p>
          ${events.map(buildEvent).join('')}
        </div>
      </div>
    </div>
  `).join('');
};

const render = (data) => {
  const summaryEl = document.getElementById('summary');
  const timelineEl = document.getElementById('timeline');
  summaryEl.innerHTML = formatSummary(data);
  const tracks = data?.shipment?.tracks ?? [];
  timelineEl.innerHTML = buildTimeline(tracks);
};

const init = async () => {
  const data = await fetchData();
  render(data || {});
};

init();
