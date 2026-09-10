const field = (item) => item?.value ?? item ?? '';
const normalize = (text) => String(text || '').toLowerCase().replace(/[\s　株式会社有限会社]/g, '');
export function findPotentialDuplicates(candidate, records) { const vendor = normalize(field(candidate.vendor)); return (Array.isArray(records) ? records : []).filter((record) => record.id !== candidate.id && record.paidDate === candidate.paidDate && Number(field(record.amount)) === Number(field(candidate.amount)) && vendor && (normalize(field(record.vendor)).includes(vendor) || vendor.includes(normalize(field(record.vendor))))); }
