// Nepal's 7 provinces and their 77 districts, for grouped <optgroup> district selects in the
// address forms and the admin service-area editor. The district a customer picks here is the
// coarse signal the delivery/lab service-area gate reads (see lib/serviceArea.ts and the backend
// api/geo.py). Doctor consultation is nationwide and never touches this.

export interface Province {
  name: string
  districts: string[]
}

export const NEPAL_PROVINCES: Province[] = [
  {
    name: 'Koshi',
    districts: ['Bhojpur', 'Dhankuta', 'Ilam', 'Jhapa', 'Khotang', 'Morang', 'Okhaldhunga',
      'Panchthar', 'Sankhuwasabha', 'Solukhumbu', 'Sunsari', 'Taplejung', 'Terhathum', 'Udayapur'],
  },
  {
    name: 'Madhesh',
    districts: ['Bara', 'Dhanusha', 'Mahottari', 'Parsa', 'Rautahat', 'Saptari', 'Sarlahi', 'Siraha'],
  },
  {
    name: 'Bagmati',
    districts: ['Bhaktapur', 'Chitwan', 'Dhading', 'Dolakha', 'Kathmandu', 'Kavrepalanchok',
      'Lalitpur', 'Makwanpur', 'Nuwakot', 'Ramechhap', 'Rasuwa', 'Sindhuli', 'Sindhupalchok'],
  },
  {
    name: 'Gandaki',
    districts: ['Baglung', 'Gorkha', 'Kaski', 'Lamjung', 'Manang', 'Mustang', 'Myagdi', 'Nawalpur',
      'Parbat', 'Syangja', 'Tanahun'],
  },
  {
    name: 'Lumbini',
    districts: ['Arghakhanchi', 'Banke', 'Bardiya', 'Dang', 'Eastern Rukum', 'Gulmi', 'Kapilvastu',
      'Nawalparasi', 'Palpa', 'Pyuthan', 'Rolpa', 'Rupandehi'],
  },
  {
    name: 'Karnali',
    districts: ['Dailekh', 'Dolpa', 'Humla', 'Jajarkot', 'Jumla', 'Kalikot', 'Mugu', 'Salyan',
      'Surkhet', 'Western Rukum'],
  },
  {
    name: 'Sudurpashchim',
    districts: ['Achham', 'Baitadi', 'Bajhang', 'Bajura', 'Dadeldhura', 'Darchula', 'Doti',
      'Kailali', 'Kanchanpur'],
  },
]

// Flat, alphabetically sorted list of all 77 district names.
export const ALL_DISTRICTS: string[] = NEPAL_PROVINCES
  .flatMap((p) => p.districts)
  .sort((a, b) => a.localeCompare(b))

// Best-effort: pick a known district name out of free reverse-geocoded text (e.g. an OSM
// display_name or city/province string) so the address form can pre-select it. Non-authoritative —
// the dropdown remains the source of truth, and no match just leaves the field for the user to set.
export function guessDistrictFromText(...parts: (string | null | undefined)[]): string {
  const haystack = parts.filter(Boolean).join(' ').toLowerCase()
  if (!haystack) return ''
  // Longest names first so "Western Rukum" wins over a bare "Rukum" substring, etc.
  const byLength = [...ALL_DISTRICTS].sort((a, b) => b.length - a.length)
  for (const d of byLength) {
    if (haystack.includes(d.toLowerCase())) return d
  }
  return ''
}
