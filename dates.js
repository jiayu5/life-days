export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' }).format();
}

export function dayNumber(day) {
  return Date.parse(day + 'T00:00:00Z') / 86400000;
}

export function duration(from, to) {
  const difference = dayNumber(to) - dayNumber(from);
  const [start, end] = difference < 0 ? [to, from] : [from, to];
  const [year, month, day] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  function anniversary(months) {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1 + months + 1, 0);
    date.setUTCDate(Math.min(day, date.getUTCDate()));
    return +date / 86400000;
  }
  let months = (endYear - year) * 12 + endMonth - month;
  if (anniversary(months) > dayNumber(end)) months--;
  const days = dayNumber(end) - anniversary(months);
  const exact = [
    [Math.floor(months / 12), '年'], [months % 12, '个月'], [days, '天'],
  ].filter(([value]) => value).map(([value, unit]) => value + unit).join(' ');
  return { difference, label: difference ? (difference > 0 ? '已过 ' : '还有 ') + exact : '就是今天' };
}
