// Apartments a customer can pick when they order to a place "inside" (instead of dropping a map pin).
// This list is the only source of truth: the shop page gets it from /api/config, and the server refuses any
// apartment that is not in it. TODO: replace these placeholders with the real apartment names.
export const APARTMENTS = [
  'Apartment block A',
  'Apartment block B',
  'Apartment block C',
  'Apartment block D',
];

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

// Turns the "inside" form fields into one delivery address line, or an error message for the customer.
// Apartment must be on the list; floor and house number are required; extra info is optional.
export function insideAddress(b) {
  const apartment = clean(b.apartment, 80);
  if (!APARTMENTS.includes(apartment)) return { error: 'Please pick your apartment from the list.' };
  const floor = clean(b.floor, 10), house = clean(b.house, 10);
  const ok = /^[A-Za-z0-9][A-Za-z0-9 \-\/]{0,9}$/;
  if (!ok.test(floor)) return { error: 'Enter your floor, like 3 or G.' };
  if (!ok.test(house)) return { error: 'Enter your house or door number, like 12 or B4.' };
  const notes = clean(b.notes, 120);
  return { address: `${apartment}, floor ${floor}, house ${house}` + (notes ? ` (${notes})` : '') };
}
