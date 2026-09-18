// ============ بيانات كروت اللاعبين — مملكة الألعاب ============
// 97+ كرت من 80 حتى 99 — كلها تُعرض بقالب FC25 الذهبي الموحد مع صور وجه حقيقية
// تشمل حراس المرمى (GK) بإحصائيات: DIV/HAN/KIC/REF/SPD/POS
// كل كرت له وزن ظهور (نسبة) — كلما زاد التقييم قلّت نسبة ظهوره في المزاد

export interface PlayerCardData {
  id: string
  name: string
  rating: number // 80-99
  pos: 'GK' | 'ST' | 'RW' | 'LW' | 'CAM' | 'CM' | 'CDM' | 'CB' | 'RB' | 'LB' | 'RM'
  pac: number
  sho: number
  pas: number
  dri: number
  def: number
  phy: number
  nation: string // علم الدولة emoji
  club: string
  league: string
  photo?: string // صورة وجه لاعب (تُركب على قالب FC25 الذهبي)
  gk?: boolean // حارس مرمى — تُعرض إحصائياته بتسميات الحراس
  alt?: string[] // مراكز بديلة (تظهر كبطاقات جانبية)
}

// ===== الكروت الأصلية (النجوم — صور وجهم حقيقية) =====
const ORIGINALS: PlayerCardData[] = [
  { id: 'messi-1', name: 'Messi', rating: 99, pos: 'RW', pac: 94, sho: 97, pas: 99, dri: 99, def: 48, phy: 85, nation: '🇦🇷', club: 'Inter Miami', league: 'MLS', photo: '/cards/photos/messi.jpg', alt: ['RM', 'CAM', 'ST'] },
  { id: 'messi-2', name: 'Messi', rating: 93, pos: 'RW', pac: 97, sho: 95, pas: 99, dri: 99, def: 38, phy: 68, nation: '🇦🇷', club: 'Inter Miami', league: 'MLS', photo: '/cards/photos/messi.jpg', alt: ['RM', 'CAM', 'ST'] },
  { id: 'messi-3', name: 'Messi', rating: 97, pos: 'RW', pac: 95, sho: 98, pas: 99, dri: 99, def: 45, phy: 86, nation: '🇦🇷', club: 'Inter Miami', league: 'MLS', photo: '/cards/photos/messi.jpg', alt: ['RM', 'CAM', 'ST'] },
  { id: 'salah-1', name: 'Salah', rating: 99, pos: 'RW', pac: 99, sho: 97, pas: 95, dri: 99, def: 62, phy: 90, nation: '🇪🇬', club: 'Liverpool', league: 'PL', photo: '/cards/photos/salah.jpg', alt: ['RM', 'ST'] },
  { id: 'salah-2', name: 'Salah', rating: 96, pos: 'RW', pac: 95, sho: 96, pas: 94, dri: 98, def: 58, phy: 88, nation: '🇪🇬', club: 'Liverpool', league: 'PL', photo: '/cards/photos/salah.jpg', alt: ['RM', 'ST'] },
  { id: 'salah-3', name: 'Salah', rating: 97, pos: 'RW', pac: 96, sho: 97, pas: 95, dri: 99, def: 60, phy: 90, nation: '🇪🇬', club: 'Liverpool', league: 'PL', photo: '/cards/photos/salah.jpg', alt: ['RM', 'ST'] },
  { id: 'salah-4', name: 'Salah', rating: 95, pos: 'RW', pac: 95, sho: 95, pas: 93, dri: 97, def: 56, phy: 86, nation: '🇪🇬', club: 'Liverpool', league: 'PL', photo: '/cards/photos/salah.jpg', alt: ['RM', 'ST'] },
  { id: 'ronaldo-1', name: 'Cristiano Ronaldo', rating: 99, pos: 'ST', pac: 95, sho: 99, pas: 94, dri: 98, def: 48, phy: 94, nation: '🇵🇹', club: 'Al Nassr', league: 'RSL', photo: '/cards/photos/ronaldo.jpg', alt: ['LW', 'CAM'] },
  { id: 'ronaldo-2', name: 'Cristiano Ronaldo', rating: 95, pos: 'ST', pac: 94, sho: 97, pas: 90, dri: 95, def: 45, phy: 95, nation: '🇵🇹', club: 'Al Nassr', league: 'RSL', photo: '/cards/photos/ronaldo.jpg', alt: ['LW'] },
  { id: 'ronaldo-3', name: 'Cristiano Ronaldo', rating: 97, pos: 'ST', pac: 95, sho: 98, pas: 92, dri: 96, def: 46, phy: 95, nation: '🇵🇹', club: 'Al Nassr', league: 'RSL', photo: '/cards/photos/ronaldo.jpg', alt: ['LW', 'CAM'] },
  { id: 'ronaldo-4', name: 'Cristiano Ronaldo', rating: 93, pos: 'ST', pac: 93, sho: 96, pas: 89, dri: 94, def: 44, phy: 93, nation: '🇵🇹', club: 'Al Nassr', league: 'RSL', photo: '/cards/photos/ronaldo.jpg' },
  { id: 'haaland-1', name: 'Haaland', rating: 98, pos: 'ST', pac: 97, sho: 99, pas: 95, dri: 96, def: 60, phy: 98, nation: '🇳🇴', club: 'Man City', league: 'PL', photo: '/cards/photos/haaland.jpg' },
  { id: 'haaland-2', name: 'Haaland', rating: 96, pos: 'ST', pac: 97, sho: 98, pas: 92, dri: 95, def: 58, phy: 98, nation: '🇳🇴', club: 'Man City', league: 'PL', photo: '/cards/photos/haaland.jpg' },
  { id: 'haaland-3', name: 'Haaland', rating: 95, pos: 'ST', pac: 96, sho: 98, pas: 90, dri: 94, def: 56, phy: 97, nation: '🇳🇴', club: 'Man City', league: 'PL', photo: '/cards/photos/haaland.jpg' },
  { id: 'haaland-4', name: 'Haaland', rating: 94, pos: 'ST', pac: 95, sho: 97, pas: 90, dri: 94, def: 57, phy: 97, nation: '🇳🇴', club: 'Man City', league: 'PL', photo: '/cards/photos/haaland.jpg' },
  { id: 'mbappe-1', name: 'Mbappé', rating: 91, pos: 'ST', pac: 96, sho: 91, pas: 80, dri: 92, def: 29, phy: 76, nation: '🇫🇷', club: 'Real Madrid', league: 'La Liga', photo: '/cards/photos/mbappe.jpg', alt: ['LW'] },
  { id: 'mbappe-2', name: 'Mbappé', rating: 93, pos: 'ST', pac: 97, sho: 92, pas: 82, dri: 93, def: 31, phy: 78, nation: '🇫🇷', club: 'Real Madrid', league: 'La Liga', photo: '/cards/photos/mbappe.jpg', alt: ['LW'] },
  { id: 'yamal-1', name: 'Lamine Yamal', rating: 91, pos: 'RW', pac: 92, sho: 85, pas: 89, dri: 94, def: 38, phy: 66, nation: '🇪🇸', club: 'Barcelona', league: 'La Liga', photo: '/cards/photos/yamal.jpg', alt: ['RM'] },
  { id: 'yamal-2', name: 'Lamine Yamal', rating: 93, pos: 'RW', pac: 93, sho: 87, pas: 91, dri: 96, def: 40, phy: 68, nation: '🇪🇸', club: 'Barcelona', league: 'La Liga', photo: '/cards/photos/yamal.jpg', alt: ['RM'] },
  { id: 'maradona-1', name: 'Maradona', rating: 95, pos: 'CAM', pac: 94, sho: 95, pas: 93, dri: 98, def: 30, phy: 78, nation: '🇦🇷', club: 'Icon', league: 'ICON', photo: '/cards/photos/maradona.jpg', alt: ['LW', 'ST'] },
  { id: 'marmoush-1', name: 'Marmoush', rating: 82, pos: 'LW', pac: 90, sho: 83, pas: 79, dri: 84, def: 38, phy: 74, nation: '🇪🇬', club: 'Man City', league: 'PL', photo: '/cards/photos/marmoush.jpg', alt: ['ST', 'LM'] },
  { id: 'marmoush-2', name: 'Marmoush', rating: 85, pos: 'ST', pac: 91, sho: 86, pas: 81, dri: 86, def: 40, phy: 76, nation: '🇪🇬', club: 'Man City', league: 'PL', photo: '/cards/photos/marmoush.jpg', alt: ['LW'] },
]

// ===== إحصائيات مولّدة واقعية حسب المركز والتقييم =====
const POS_PROFILE: Record<string, { pac: number; sho: number; pas: number; dri: number; def: number; phy: number }> = {
  ST: { pac: 3, sho: 6, pas: -7, dri: 0, def: -22, phy: 3 },
  RW: { pac: 6, dri: 5, sho: 0, pas: 1, def: -24, phy: -6 },
  LW: { pac: 6, dri: 5, sho: 0, pas: 1, def: -24, phy: -6 },
  RM: { pac: 5, dri: 4, sho: 0, pas: 2, def: -16, phy: -4 },
  CAM: { pac: -2, sho: -1, pas: 6, dri: 6, def: -17, phy: -6 },
  CM: { pac: -3, sho: -5, pas: 6, dri: 3, def: 1, phy: 1 },
  CDM: { pac: -5, sho: -9, pas: 4, dri: -4, def: 7, phy: 5 },
  CB: { pac: -4, sho: -27, pas: -3, dri: -11, def: 7, phy: 7 },
  RB: { pac: 6, sho: -23, pas: 2, dri: -3, def: 4, phy: 2 },
  LB: { pac: 6, sho: -23, pas: 2, dri: -3, def: 4, phy: 2 },
  // الحارس: DIV/HAN/KIC/REF/SPD/POS — تُخزن بنفس الحقول بالترتيب
  GK: { pac: 4, sho: 2, pas: -6, dri: 6, def: -2, phy: 3 },
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function genStats(id: string, rating: number, pos: string) {
  const prof = POS_PROFILE[pos] || POS_PROFILE.CM
  const j = (k: number) => Math.round((hash(id + k) - 0.5) * 8) // اهتزاز ±4 ثابت لكل لاعب
  const c = (v: number) => Math.max(25, Math.min(99, Math.round(v)))
  return {
    pac: c(rating + prof.pac + j(1)),
    sho: c(rating + prof.sho + j(2)),
    pas: c(rating + prof.pas + j(3)),
    dri: c(rating + prof.dri + j(4)),
    def: c(rating + prof.def + j(5)),
    phy: c(rating + prof.phy + j(6)),
  }
}

// ===== اللاعبون الإضافيون (صورهم في /cards/photos) =====
interface NewPlayerDef {
  id: string
  name: string
  rating: number
  pos: PlayerCardData['pos']
  nation: string
  club: string
  league: string
  alt?: string[]
}

const NEW_PLAYERS: NewPlayerDef[] = [
  // ===== حراس المرمى =====
  { id: 'courtois', name: 'Courtois', rating: 97, pos: 'GK', nation: '🇧🇪', club: 'Real Madrid', league: 'La Liga' },
  { id: 'alisson', name: 'Alisson', rating: 95, pos: 'GK', nation: '🇧🇷', club: 'Liverpool', league: 'PL' },
  { id: 'buffon', name: 'Buffon', rating: 95, pos: 'GK', nation: '🇮🇹', club: 'Icon', league: 'ICON' },
  { id: 'casillas', name: 'Casillas', rating: 94, pos: 'GK', nation: '🇪🇸', club: 'Icon', league: 'ICON' },
  { id: 'donnarumma', name: 'Donnarumma', rating: 94, pos: 'GK', nation: '🇮🇹', club: 'Man City', league: 'PL' },
  { id: 'martinez', name: 'E. Martínez', rating: 93, pos: 'GK', nation: '🇦🇷', club: 'Aston Villa', league: 'PL' },
  { id: 'bounou', name: 'Bounou', rating: 92, pos: 'GK', nation: '🇲🇦', club: 'Al Hilal', league: 'RSL' },
  { id: 'neuer', name: 'Neuer', rating: 92, pos: 'GK', nation: '🇩🇪', club: 'Bayern', league: 'Bundesliga' },
  { id: 'ederson', name: 'Ederson', rating: 90, pos: 'GK', nation: '🇧🇷', club: 'Fenerbahçe', league: 'Süper Lig' },
  { id: 'maignan', name: 'Maignan', rating: 88, pos: 'GK', nation: '🇫🇷', club: 'AC Milan', league: 'Serie A' },
  { id: 'kobel', name: 'Kobel', rating: 87, pos: 'GK', nation: '🇨🇭', club: 'Dortmund', league: 'Bundesliga' },
  { id: 'elshenawy', name: 'El Shenawy', rating: 86, pos: 'GK', nation: '🇪🇬', club: 'Al Ahly', league: 'EGY' },
  // ===== 95-97 (نادرة جداً) =====
  { id: 'bellingham', name: 'Bellingham', rating: 97, pos: 'CAM', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Real Madrid', league: 'La Liga', alt: ['CM', 'ST'] },
  { id: 'vinicius', name: 'Vinícius Jr', rating: 97, pos: 'LW', nation: '🇧🇷', club: 'Real Madrid', league: 'La Liga', alt: ['ST'] },
  { id: 'rodri', name: 'Rodri', rating: 96, pos: 'CDM', nation: '🇪🇸', club: 'Man City', league: 'PL' },
  { id: 'kane', name: 'Kane', rating: 96, pos: 'ST', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Bayern', league: 'Bundesliga' },
  { id: 'zidane', name: 'Zidane', rating: 96, pos: 'CAM', nation: '🇫🇷', club: 'Icon', league: 'ICON', alt: ['LW'] },
  { id: 'debruyne', name: 'De Bruyne', rating: 95, pos: 'CAM', nation: '🇧🇪', club: 'Napoli', league: 'Serie A', alt: ['CM'] },
  { id: 'lewandowski', name: 'Lewandowski', rating: 95, pos: 'ST', nation: '🇵🇱', club: 'Barcelona', league: 'La Liga' },
  { id: 'vandijk', name: 'Van Dijk', rating: 95, pos: 'CB', nation: '🇳🇱', club: 'Liverpool', league: 'PL' },
  { id: 'saka', name: 'Saka', rating: 95, pos: 'RW', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Arsenal', league: 'PL', alt: ['RM'] },
  { id: 'ronaldo-nazario', name: 'Ronaldo R9', rating: 95, pos: 'ST', nation: '🇧🇷', club: 'Icon', league: 'ICON' },
  // ===== 90-94 =====
  { id: 'foden', name: 'Foden', rating: 94, pos: 'CAM', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Man City', league: 'PL', alt: ['RW'] },
  { id: 'musiala', name: 'Musiala', rating: 94, pos: 'CAM', nation: '🇩🇪', club: 'Bayern', league: 'Bundesliga', alt: ['LW'] },
  { id: 'ronaldinho', name: 'Ronaldinho', rating: 94, pos: 'LW', nation: '🇧🇷', club: 'Icon', league: 'ICON', alt: ['ST'] },
  { id: 'bruno', name: 'Bruno Fernandes', rating: 93, pos: 'CAM', nation: '🇵🇹', club: 'Man United', league: 'PL', alt: ['CM'] },
  { id: 'bernarodo', name: 'Bernardo Silva', rating: 92, pos: 'CM', nation: '🇵🇹', club: 'Man City', league: 'PL', alt: ['RW'] },
  { id: 'rice', name: 'Declan Rice', rating: 92, pos: 'CDM', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Arsenal', league: 'PL' },
  { id: 'hakimi', name: 'Hakimi', rating: 92, pos: 'RB', nation: '🇲🇦', club: 'PSG', league: 'Ligue 1', alt: ['RM'] },
  { id: 'griezmann', name: 'Griezmann', rating: 92, pos: 'ST', nation: '🇫🇷', club: 'Atlético', league: 'La Liga', alt: ['CAM'] },
  { id: 'neymar', name: 'Neymar Jr', rating: 92, pos: 'LW', nation: '🇧🇷', club: 'Santos', league: 'Brasileirão', alt: ['CAM'] },
  { id: 'son', name: 'Son', rating: 91, pos: 'ST', nation: '🇰🇷', club: 'Tottenham', league: 'PL', alt: ['LW'] },
  { id: 'lautaro', name: 'Lautaro', rating: 91, pos: 'ST', nation: '🇦🇷', club: 'Inter', league: 'Serie A' },
  { id: 'valverde', name: 'Valverde', rating: 91, pos: 'CM', nation: '🇺🇾', club: 'Real Madrid', league: 'La Liga', alt: ['RM'] },
  { id: 'pedri', name: 'Pedri', rating: 91, pos: 'CM', nation: '🇪🇸', club: 'Barcelona', league: 'La Liga' },
  { id: 'raphinha', name: 'Raphinha', rating: 91, pos: 'LW', nation: '🇧🇷', club: 'Barcelona', league: 'La Liga', alt: ['RW'] },
  { id: 'benzema', name: 'Benzema', rating: 90, pos: 'ST', nation: '🇫🇷', club: 'Al-Ittihad', league: 'RSL' },
  { id: 'odegaard', name: 'Ødegaard', rating: 90, pos: 'CAM', nation: '🇳🇴', club: 'Arsenal', league: 'PL' },
  { id: 'kvara', name: 'Kvaratskhelia', rating: 90, pos: 'LW', nation: '🇬🇪', club: 'PSG', league: 'Ligue 1' },
  { id: 'osimhen', name: 'Osimhen', rating: 90, pos: 'ST', nation: '🇳🇬', club: 'Galatasaray', league: 'Süper Lig' },
  { id: 'trent', name: 'Alexander-Arnold', rating: 90, pos: 'RB', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Real Madrid', league: 'La Liga' },
  { id: 'dejong', name: 'F. de Jong', rating: 90, pos: 'CM', nation: '🇳🇱', club: 'Barcelona', league: 'La Liga' },
  { id: 'wirtz', name: 'Wirtz', rating: 90, pos: 'CAM', nation: '🇩🇪', club: 'Liverpool', league: 'PL' },
  // ===== 85-89 =====
  { id: 'palmer', name: 'Cole Palmer', rating: 89, pos: 'CAM', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Chelsea', league: 'PL', alt: ['RW'] },
  { id: 'luisdiaz', name: 'Luis Díaz', rating: 89, pos: 'LW', nation: '🇨🇴', club: 'Bayern', league: 'Bundesliga', alt: ['RW'] },
  { id: 'kimmich', name: 'Kimmich', rating: 88, pos: 'CDM', nation: '🇩🇪', club: 'Bayern', league: 'Bundesliga', alt: ['RB'] },
  { id: 'darwin', name: 'Darwin Núñez', rating: 88, pos: 'ST', nation: '🇺🇾', club: 'Al-Hilal', league: 'RSL' },
  { id: 'mahrez', name: 'Mahrez', rating: 88, pos: 'RW', nation: '🇩🇿', club: 'Al-Ahli', league: 'RSL', alt: ['LW'] },
  { id: 'rashford', name: 'Rashford', rating: 88, pos: 'ST', nation: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Barcelona', league: 'La Liga', alt: ['LW'] },
  { id: 'barella', name: 'Barella', rating: 88, pos: 'CM', nation: '🇮🇹', club: 'Inter', league: 'Serie A' },
  { id: 'cancelo', name: 'Cancelo', rating: 88, pos: 'RB', nation: '🇵🇹', club: 'Al-Hilal', league: 'RSL', alt: ['LB'] },
  { id: 'dimaria', name: 'Di María', rating: 87, pos: 'RW', nation: '🇦🇷', club: 'Rosario', league: 'Brasileirão' },
  { id: 'modric', name: 'Modrić', rating: 87, pos: 'CM', nation: '🇭🇷', club: 'AC Milan', league: 'Serie A' },
  { id: 'casemiro', name: 'Casemiro', rating: 87, pos: 'CDM', nation: '🇧🇷', club: 'Man United', league: 'PL' },
  { id: 'rudiger', name: 'Rüdiger', rating: 87, pos: 'CB', nation: '🇩🇪', club: 'Real Madrid', league: 'La Liga' },
  { id: 'alvarez', name: 'J. Álvarez', rating: 87, pos: 'ST', nation: '🇦🇷', club: 'Atlético', league: 'La Liga' },
  { id: 'militao', name: 'Militão', rating: 86, pos: 'CB', nation: '🇧🇷', club: 'Real Madrid', league: 'La Liga' },
  { id: 'rubendias', name: 'Rúben Dias', rating: 86, pos: 'CB', nation: '🇵🇹', club: 'Man City', league: 'PL' },
  { id: 'gvardiol', name: 'Gvardiol', rating: 86, pos: 'CB', nation: '🇭🇷', club: 'Man City', league: 'PL', alt: ['LB'] },
  { id: 'olise', name: 'Olise', rating: 86, pos: 'RW', nation: '🇫🇷', club: 'Bayern', league: 'Bundesliga' },
  { id: 'macallister', name: 'Mac Allister', rating: 86, pos: 'CM', nation: '🇦🇷', club: 'Liverpool', league: 'PL' },
  { id: 'enzo', name: 'Enzo', rating: 86, pos: 'CM', nation: '🇦🇷', club: 'Chelsea', league: 'PL' },
  { id: 'gnabry', name: 'Gnabry', rating: 85, pos: 'RW', nation: '🇩🇪', club: 'Bayern', league: 'Bundesliga', alt: ['LW'] },
  { id: 'havertz', name: 'Havertz', rating: 85, pos: 'ST', nation: '🇩🇪', club: 'Arsenal', league: 'PL', alt: ['CAM'] },
  { id: 'saliba', name: 'Saliba', rating: 85, pos: 'CB', nation: '🇫🇷', club: 'Arsenal', league: 'PL' },
  { id: 'gabriel', name: 'Gabriel', rating: 85, pos: 'CB', nation: '🇧🇷', club: 'Arsenal', league: 'PL' },
  { id: 'mss', name: 'Milinković-Savić', rating: 85, pos: 'CM', nation: '🇷🇸', club: 'Al-Hilal', league: 'RSL' },
  // ===== 80-84 =====
  { id: 'szoboszlai', name: 'Szoboszlai', rating: 84, pos: 'CAM', nation: '🇭🇺', club: 'Liverpool', league: 'PL', alt: ['CM'] },
  { id: 'martinelli', name: 'Martinelli', rating: 84, pos: 'LW', nation: '🇧🇷', club: 'Arsenal', league: 'PL', alt: ['ST'] },
  { id: 'gakpo', name: 'Gakpo', rating: 84, pos: 'ST', nation: '🇳🇱', club: 'Liverpool', league: 'PL', alt: ['LW'] },
  { id: 'olmo', name: 'Dani Olmo', rating: 84, pos: 'CAM', nation: '🇪🇸', club: 'Barcelona', league: 'La Liga' },
  { id: 'nicowilliams', name: 'Nico Williams', rating: 84, pos: 'LW', nation: '🇪🇸', club: 'Bilbao', league: 'La Liga', alt: ['RW'] },
  { id: 'tchouameni', name: 'Tchouaméni', rating: 84, pos: 'CDM', nation: '🇫🇷', club: 'Real Madrid', league: 'La Liga', alt: ['CB'] },
  { id: 'camavinga', name: 'Camavinga', rating: 84, pos: 'CM', nation: '🇫🇷', club: 'Real Madrid', league: 'La Liga', alt: ['CDM'] },
  { id: 'kounde', name: 'Koundé', rating: 84, pos: 'RB', nation: '🇫🇷', club: 'Barcelona', league: 'La Liga', alt: ['CB'] },
  { id: 'theo', name: 'Theo Hernández', rating: 84, pos: 'LB', nation: '🇫🇷', club: 'Al-Hilal', league: 'RSL' },
  { id: 'davies', name: 'Alphonso Davies', rating: 84, pos: 'LB', nation: '🇨🇦', club: 'Bayern', league: 'Bundesliga' },
  { id: 'ferran', name: 'Ferran Torres', rating: 83, pos: 'ST', nation: '🇪🇸', club: 'Barcelona', league: 'La Liga', alt: ['RW'] },
  { id: 'gavi', name: 'Gavi', rating: 83, pos: 'CM', nation: '🇪🇸', club: 'Barcelona', league: 'La Liga' },
  { id: 'frimpong', name: 'Frimpong', rating: 83, pos: 'RB', nation: '🇳🇱', club: 'Liverpool', league: 'PL', alt: ['RM'] },
  { id: 'islamsarr', name: 'Ismaila Sarr', rating: 82, pos: 'RW', nation: '🇸🇳', club: 'Crystal Palace', league: 'PL', alt: ['ST'] },
  { id: 'zaha', name: 'Zaha', rating: 82, pos: 'LW', nation: '🇨🇮', club: 'Galatasaray', league: 'Süper Lig' },
  { id: 'aldawsari', name: 'Al-Dawsari', rating: 82, pos: 'LW', nation: '🇸🇦', club: 'Al-Hilal', league: 'RSL' },
  { id: 'adeyemi', name: 'Adeyemi', rating: 82, pos: 'LW', nation: '🇩🇪', club: 'Dortmund', league: 'Bundesliga', alt: ['ST'] },
  { id: 'ansufati', name: 'Ansu Fati', rating: 81, pos: 'ST', nation: '🇪🇸', club: 'Monaco', league: 'Ligue 1', alt: ['LW'] },
  { id: 'buraikan', name: 'Firas Al-Buraikan', rating: 80, pos: 'ST', nation: '🇸🇦', club: 'Al-Ahli', league: 'RSL' },
  { id: 'trezeguet', name: 'Trezeguet', rating: 80, pos: 'LW', nation: '🇪🇬', club: 'Trabzonspor', league: 'Süper Lig', alt: ['RM'] },
  { id: 'elneny', name: 'Elneny', rating: 80, pos: 'CM', nation: '🇪🇬', club: 'Al Ahly', league: 'EGY' },
  { id: 'mostafamohamed', name: 'Mostafa Mohamed', rating: 80, pos: 'ST', nation: '🇪🇬', club: 'Nantes', league: 'Ligue 1' },
  { id: 'emamashour', name: 'Emam Ashour', rating: 80, pos: 'CM', nation: '🇪🇬', club: 'Al Ahly', league: 'EGY', alt: ['CAM'] },
]

function buildAll(): PlayerCardData[] {
  const generated: PlayerCardData[] = NEW_PLAYERS.map((p) => {
    const s = genStats(p.id, p.rating, p.pos)
    return {
      id: p.id,
      name: p.name,
      rating: p.rating,
      pos: p.pos,
      ...s,
      nation: p.nation,
      club: p.club,
      league: p.league,
      photo: `/cards/photos/${p.id}.jpg`,
      gk: p.pos === 'GK' || undefined,
      alt: p.alt,
    }
  })
  return [...ORIGINALS, ...generated]
}

export const ALL_CARDS: PlayerCardData[] = buildAll()

export const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]))

// ===== نسب الظهور (الوزن) — كلما زاد التقييم قلّ الوزن =====
export function weightFor(rating: number): number {
  if (rating >= 99) return 1
  if (rating >= 98) return 1
  if (rating >= 97) return 2
  if (rating >= 95) return 4
  if (rating >= 93) return 9
  if (rating >= 91) return 15
  if (rating >= 89) return 24
  if (rating >= 87) return 36
  if (rating >= 85) return 50
  if (rating >= 83) return 70
  return 100 // 80-82 شائعة
}

export function percentFor(rating: number): number {
  const total = ALL_CARDS.reduce((s, c) => s + weightFor(c.rating), 0)
  return Math.max(0.1, Math.round((weightFor(rating) / total) * 1000) / 10)
}

// ===== اختيار كرت عشوائي موزون (مع فلاتر اختيارية) =====
export function pickWeightedCard(rng: () => number = Math.random, pool: PlayerCardData[] = ALL_CARDS): PlayerCardData {
  const weights = pool.map((c) => weightFor(c.rating))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

export function pickCards(n: number, rng: () => number = Math.random): PlayerCardData[] {
  return Array.from({ length: n }, () => pickWeightedCard(rng))
}

// قوة الكرت في مركزه (للمحاكاة)
export function cardPower(c: PlayerCardData): number {
  if (c.gk) return Math.round(c.dri * 0.3 + c.pac * 0.25 + c.sho * 0.25 + c.phy * 0.2) // REF+DIV+HAN+POS
  const roleSho = ['ST', 'RW', 'LW', 'CAM', 'RM'].includes(c.pos)
  const roleDef = ['CB', 'RB', 'LB', 'CDM'].includes(c.pos)
  if (roleSho) return Math.round(c.sho * 0.4 + c.dri * 0.25 + c.pac * 0.2 + c.pas * 0.15)
  if (roleDef) return Math.round(c.def * 0.5 + c.phy * 0.25 + c.pac * 0.15 + c.pas * 0.1)
  return Math.round(c.pas * 0.35 + c.dri * 0.3 + c.sho * 0.15 + c.def * 0.1 + c.pac * 0.1)
}

// القيمة السوقية بالملايين (للمزاد)
export function marketValue(c: PlayerCardData): number {
  const base = Math.pow(Math.max(1, c.rating - 70), 2.05) * 0.55
  return Math.max(5, Math.round(base))
}

// مستويات التصنيف حسب النقاط
export interface RankTier {
  name: string
  min: number
  color: string
  icon: string
}

export const RANK_TIERS: RankTier[] = [
  { name: 'ملكي', min: 2000, color: '#f59e0b', icon: '👑' },
  { name: 'ماسي', min: 1200, color: '#67e8f9', icon: '💎' },
  { name: 'ذهبي', min: 700, color: '#fbbf24', icon: '🥇' },
  { name: 'فضي', min: 350, color: '#cbd5e1', icon: '🥈' },
  { name: 'برونزي', min: 100, color: '#d97706', icon: '🥉' },
  { name: 'مبتدئ', min: 0, color: '#94a3b8', icon: '🌱' },
]

export function rankFor(points: number): RankTier {
  return RANK_TIERS.find((t) => points >= t.min) || RANK_TIERS[RANK_TIERS.length - 1]
}

// نقاط الألعاب
export const POINTS = {
  win: 25,
  draw: 10,
  loss: 5,
  auctionWin: 30,
  mysteryWin: 30,
  xoWin: 15,
  xoDraw: 8,
  xoLoss: 3,
}
