import { StudioScript } from './schema';

export const SAMPLE_TOPIC =
  'What if mỗi phút bạn trì hoãn bài tập về nhà làm phòng ngủ nhỏ lại 10cm?';

export const SAMPLE_SCRIPT: StudioScript = {
  title: 'Phòng Ngủ Co Nhỏ Mỗi Phút Trì Hoãn Bài Tập!',
  description:
    'Bạn thức dậy và phát hiện bức tường phòng ngủ tự động thu hẹp 10cm mỗi phút bạn lười làm bài tập.',
  hashtags: ['#whatif', '#blobtoon', '#hoathinh2d', '#hocsinh'],
  scenes: [
    {
      label: 'HOOK',
      bg: ['#1e1b4b', '#312e81'],
      caption: 'Bạn nằm với tới tay cầm và điện thoại trên bàn vì phòng co lại 10cm!',
      characters: [
        { id: 'ban', color: '#38bdf8', emotion: 'shock', anim: 'pop-in', x: 0.32, y: 0.68 },
        { id: 'me', color: '#f472b6', emotion: 'smug', anim: 'idle', x: 0.72, y: 0.68 },
      ],
      lines: [
        {
          speaker: 'narrator',
          text: 'Bạn nằm với tới tay cầm và điện thoại trên bàn khi tường dịch vào!',
          emotion: 'shock',
          bubble: false,
        },
        {
          speaker: 'ban',
          text: 'Ủa sao với tới tay cầm luôn?!',
          emotion: 'shock',
          bubble: false,
        },
        {
          speaker: 'me',
          text: 'Trì hoãn một phút, phòng co mười phân!',
          emotion: 'smug',
          bubble: false,
        },
      ],
      props: [
        { type: 'phone', x: 0.45, y: 0.52, surface: 'table' },
        { type: 'controller', x: 0.56, y: 0.52, surface: 'table' },
      ],
    },
    {
      label: 'DAY 1',
      bg: ['#064e3b', '#0f766e'],
      caption: 'NGÀY 1: Bạn nằm với tới tay cầm và điện thoại ngay trên bàn!',
      characters: [
        { id: 'ban', color: '#38bdf8', emotion: 'laughing', anim: 'bounce', x: 0.34, y: 0.68 },
        { id: 'ban_than', color: '#facc15', emotion: 'happy', anim: 'walk', x: 0.72, y: 0.68 },
      ],
      lines: [
        {
          speaker: 'narrator',
          text: 'Ngày đầu tiên trì hoãn mười lăm phút làm bàn học dịch sát giường!',
          emotion: 'happy',
          bubble: false,
        },
        {
          speaker: 'ban',
          text: 'Nằm im cũng lấy được máy!',
          emotion: 'laughing',
          bubble: false,
        },
        {
          speaker: 'ban_than',
          text: 'Khỏi cần đứng dậy luôn bạn ơi!',
          emotion: 'happy',
          bubble: false,
        },
      ],
      props: [
        { type: 'controller', x: 0.46, y: 0.5, surface: 'table' },
        { type: 'phone', x: 0.58, y: 0.5, surface: 'table' },
      ],
    },
    {
      label: 'DAY 2',
      bg: ['#7c2d12', '#9a3412'],
      caption: 'NGÀY 2: Bạn ngủ quên 2 tiếng và căn phòng ép chặt như chiếc hộp!',
      characters: [
        { id: 'ban', color: '#38bdf8', emotion: 'angry', anim: 'shake', x: 0.36, y: 0.68 },
        { id: 'em_ut', color: '#a78bfa', emotion: 'sleepy', anim: 'jump', x: 0.66, y: 0.68 },
      ],
      lines: [
        {
          speaker: 'narrator',
          text: 'Sang ngày thứ hai, bạn lỡ ngủ gục trước đống bài tập lịch sử.',
          emotion: 'shock',
          bubble: false,
        },
        {
          speaker: 'ban',
          text: 'Cửa phòng kẹt cứng rồi!',
          emotion: 'shock',
          bubble: false,
        },
        {
          speaker: 'em_ut',
          text: 'Cứu em với anh hai ơi!',
          emotion: 'angry',
          bubble: false,
        },
      ],
      props: [
        { type: 'door', x: 0.5, y: 0.46, surface: 'ground' },
        { type: 'homework', x: 0.3, y: 0.48, surface: 'hand:ban' },
      ],
    },
    {
      label: 'DAY 3',
      bg: ['#4c0519', '#881337'],
      caption: 'NGÀY 3: Giải xong hết bài tập làm căn phòng nổ tung rộng bằng sân bóng!',
      characters: [
        { id: 'ban', color: '#38bdf8', emotion: 'happy', anim: 'jump', x: 0.35, y: 0.68 },
        { id: 'me', color: '#f472b6', emotion: 'shock', anim: 'bounce', x: 0.68, y: 0.68 },
      ],
      lines: [
        {
          speaker: 'narrator',
          text: 'Ngày thứ ba, bạn giải liền một mạch năm mươi bài toán nâng cao.',
          emotion: 'happy',
          bubble: false,
        },
        {
          speaker: 'ban',
          text: 'Phòng rộng như sân vận động luôn!',
          emotion: 'happy',
          bubble: false,
        },
        {
          speaker: 'me',
          text: 'Quên đánh răng là trần nhà sập nhé!',
          emotion: 'shock',
          bubble: false,
        },
      ],
      props: [
        { type: 'toothbrush', x: 0.5, y: 0.45, surface: 'hand:me' },
        { type: 'heart', x: 0.5, y: 0.32, surface: 'float' },
      ],
    },
  ],
  thumbnail: {
    text: 'PHÒNG CO 10CM?!',
    emotion1: 'shock',
    emotion2: 'smug',
    keyProp: 'controller',
    bgStyle: 'sunburst',
    accentColor: '#facc15',
  },
};
