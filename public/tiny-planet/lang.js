/**
 * 介面文字的多語表。
 *
 * 只放「玩家看得到」的字串:開場、操作說明、按鈕提示、機身配色名稱。
 * 遊戲內沒有其他文案,所以不需要完整的 i18n 框架。
 */

export const LANG_NAMES = {
    en: 'English',
    zh: '繁體中文',
    zhs: '简体中文',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    it: 'Italiano',
    es: 'Español',
    th: 'ไทย',
    ar: 'العربية',
}

// 由右至左書寫的語言。加新語言時記得一起維護
export const RTL = new Set(['ar'])

export const I18N = {
    en: {
        sub: 'Fly around a tiny planet',
        start: 'TAKE OFF',
        controls: 'Flight controls',
        space: 'SPACE',
        fire: 'Paintball',
        hint: '👆 Drag to steer · two fingers to boost',
        tipFs: 'Fullscreen', tipFsExit: 'Exit fullscreen',
        tipMusic: 'Music', tipColor: 'Plane colour', tipHelp: 'Controls',
        tipFire: 'Fire paintball (Space)',
        donate: 'Support this project',
        colors: ['Strawberry', 'Peach', 'Lemon', 'Matcha', 'Mint', 'Sky', 'Lavender', 'Lilac'],
    },
    zh: {
        sub: '在小星球上飛行',
        start: '起飛',
        controls: '飛行操作',
        space: '空白鍵',
        fire: '發射漆彈',
        hint: '👆 按住畫面拖曳操縱 ・ 雙指加速',
        tipFs: '全螢幕', tipFsExit: '離開全螢幕',
        tipMusic: '音樂', tipColor: '機身顏色', tipHelp: '操作說明',
        tipFire: '發射漆彈(空白鍵)',
        donate: '支持這個專案',
        colors: ['草莓', '蜜桃', '檸檬', '抹茶', '薄荷', '天空', '薰衣草', '丁香'],
    },
    zhs: {
        sub: '在小星球上飞行',
        start: '起飞',
        controls: '飞行操作',
        space: '空格键',
        fire: '发射彩弹',
        hint: '👆 按住屏幕拖动操纵 ・ 双指加速',
        tipFs: '全屏', tipFsExit: '退出全屏',
        tipMusic: '音乐', tipColor: '机身颜色', tipHelp: '操作说明',
        tipFire: '发射彩弹(空格键)',
        donate: '支持这个项目',
        colors: ['草莓', '蜜桃', '柠檬', '抹茶', '薄荷', '天空', '薰衣草', '丁香'],
    },
    ja: {
        sub: '小さな惑星を飛びまわろう',
        start: 'スタート',
        controls: '操作方法',
        space: 'スペース',
        fire: 'ペイント弾',
        hint: '👆 ドラッグで操縦 ・ 2本指で加速',
        tipFs: 'フルスクリーン', tipFsExit: 'フルスクリーン解除',
        tipMusic: '音楽', tipColor: '機体の色', tipHelp: '操作方法',
        tipFire: 'ペイント弾を撃つ(スペース)',
        donate: 'このプロジェクトを支援',
        colors: ['ストロベリー', 'ピーチ', 'レモン', '抹茶', 'ミント', 'スカイ', 'ラベンダー', 'ライラック'],
    },
    ko: {
        sub: '작은 행성 위를 날아보세요',
        start: '이륙',
        controls: '조작 방법',
        space: '스페이스',
        fire: '페인트볼',
        hint: '👆 드래그로 조종 · 두 손가락으로 가속',
        tipFs: '전체화면', tipFsExit: '전체화면 종료',
        tipMusic: '음악', tipColor: '기체 색상', tipHelp: '조작 방법',
        tipFire: '페인트볼 발사 (스페이스)',
        donate: '이 프로젝트 후원하기',
        colors: ['딸기', '복숭아', '레몬', '말차', '민트', '하늘', '라벤더', '라일락'],
    },
    fr: {
        sub: 'Volez autour d’une petite planète',
        start: 'DÉCOLLER',
        controls: 'Commandes',
        space: 'ESPACE',
        fire: 'Peinture',
        hint: '👆 Glissez pour piloter · deux doigts pour accélérer',
        tipFs: 'Plein écran', tipFsExit: 'Quitter le plein écran',
        tipMusic: 'Musique', tipColor: 'Couleur de l’avion', tipHelp: 'Commandes',
        tipFire: 'Tirer une bille de peinture (Espace)',
        donate: 'Soutenir ce projet',
        colors: ['Fraise', 'Pêche', 'Citron', 'Matcha', 'Menthe', 'Ciel', 'Lavande', 'Lilas'],
    },
    it: {
        sub: 'Vola attorno a un piccolo pianeta',
        start: 'DECOLLA',
        controls: 'Comandi',
        space: 'SPAZIO',
        fire: 'Vernice',
        hint: '👆 Trascina per virare · due dita per accelerare',
        tipFs: 'Schermo intero', tipFsExit: 'Esci da schermo intero',
        tipMusic: 'Musica', tipColor: 'Colore dell’aereo', tipHelp: 'Comandi',
        tipFire: 'Spara pallina di vernice (Spazio)',
        donate: 'Sostieni il progetto',
        colors: ['Fragola', 'Pesca', 'Limone', 'Matcha', 'Menta', 'Cielo', 'Lavanda', 'Lillà'],
    },
    es: {
        sub: 'Vuela alrededor de un pequeño planeta',
        start: 'DESPEGAR',
        controls: 'Controles',
        space: 'ESPACIO',
        fire: 'Pintura',
        hint: '👆 Arrastra para girar · dos dedos para acelerar',
        tipFs: 'Pantalla completa', tipFsExit: 'Salir de pantalla completa',
        tipMusic: 'Música', tipColor: 'Color del avión', tipHelp: 'Controles',
        tipFire: 'Disparar bola de pintura (Espacio)',
        donate: 'Apoya este proyecto',
        colors: ['Fresa', 'Melocotón', 'Limón', 'Matcha', 'Menta', 'Cielo', 'Lavanda', 'Lila'],
    },
    th: {
        sub: 'บินรอบดาวเคราะห์ดวงน้อย',
        start: 'บินขึ้น',
        controls: 'การควบคุม',
        space: 'สเปซ',
        fire: 'ลูกสี',
        hint: '👆 ลากเพื่อบังคับ · สองนิ้วเพื่อเร่ง',
        tipFs: 'เต็มจอ', tipFsExit: 'ออกจากเต็มจอ',
        tipMusic: 'เพลง', tipColor: 'สีเครื่องบิน', tipHelp: 'การควบคุม',
        tipFire: 'ยิงลูกสี (สเปซ)',
        donate: 'สนับสนุนโปรเจกต์นี้',
        colors: ['สตรอว์เบอร์รี', 'พีช', 'เลมอน', 'มัทฉะ', 'มินต์', 'ฟ้า', 'ลาเวนเดอร์', 'ไลแลค'],
    },
    ar: {
        sub: 'حلّق حول كوكب صغير',
        start: 'إقلاع',
        controls: 'أدوات التحكم',
        space: 'مسافة',
        fire: 'كرة طلاء',
        hint: '👆 اسحب للتوجيه · إصبعان للتسريع',
        tipFs: 'ملء الشاشة', tipFsExit: 'إنهاء ملء الشاشة',
        tipMusic: 'الموسيقى', tipColor: 'لون الطائرة', tipHelp: 'أدوات التحكم',
        tipFire: 'إطلاق كرة الطلاء (مسافة)',
        donate: 'ادعم هذا المشروع',
        colors: ['فراولة', 'خوخ', 'ليمون', 'ماتشا', 'نعناع', 'سماوي', 'خزامى', 'ليلكي'],
    },
}

/** 先看使用者存過什麼,沒有就照瀏覽器語言猜,再猜不到就英文 */
export function detectLang() {
    const saved = localStorage.getItem('tp.lang')
    if (saved && I18N[saved]) return saved
    for (const tag of (navigator.languages || [navigator.language || 'en'])) {
        const code = String(tag).toLowerCase()
        // 中文要分簡繁:zh-CN / zh-SG / zh-Hans 是簡體,其餘(TW / HK / Hant)給繁體
        if (code.startsWith('zh')) {
            return /(^|-)(cn|sg|hans)(-|$)/.test(code) ? 'zhs' : 'zh'
        }
        const two = code.slice(0, 2)
        if (I18N[two]) return two
    }
    return 'en'
}
