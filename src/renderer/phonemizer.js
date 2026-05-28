const Phonemizer = (() => {
  const KATAKANA_MAP = {
    'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
    'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
    'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
    'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
    'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
    'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
    'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
    'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
    'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
    'ワ': 'wa', 'ヰ': 'wi', 'ヱ': 'we', 'ヲ': 'wo',
    'ン': 'n',
    'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
    'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
    'ダ': 'da', 'ヂ': 'di', 'ヅ': 'du', 'デ': 'de', 'ド': 'do',
    'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
    'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
    'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
    'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho',
    'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho',
    'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
    'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
    'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
    'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
    'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo',
    'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo',
    'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo',
    'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo',
    'ファ': 'fa', 'フィ': 'fi', 'フェ': 'fe', 'フォ': 'fo',
    'ティ': 'ti', 'ディ': 'di', 'デュ': 'dyu',
    'ッ': 'cl',
    'ー': '-',
  };

  const HIRAGANA_MAP = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'ゐ': 'wi', 'ゑ': 'we', 'を': 'wo',
    'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'っ': 'cl',
    'ー': '-',
  };

  const KANA_MAP = Object.assign({}, KATAKANA_MAP, HIRAGANA_MAP);
  const sortedKana = Object.keys(KANA_MAP).sort((a, b) => b.length - a.length);

  function kanaToRomaji(text) {
    let result = '';
    let i = 0;
    while (i < text.length) {
      let matched = false;
      for (const key of sortedKana) {
        if (text.startsWith(key, i)) {
          result += KANA_MAP[key];
          i += key.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        result += text[i];
        i++;
      }
    }
    return result;
  }

  const ROMAJI_MAP = {
    'a': 'a', 'i': 'i', 'u': 'u', 'e': 'e', 'o': 'o',
    'ka': 'k a', 'ki': 'k i', 'ku': 'k u', 'ke': 'k e', 'ko': 'k o',
    'sa': 's a', 'si': 'sh i', 'shi': 'sh i', 'su': 's u', 'se': 's e', 'so': 's o',
    'ta': 't a', 'ti': 'ch i', 'chi': 'ch i', 'tsu': 'ts u', 'tu': 'ts u', 'te': 't e', 'to': 't o',
    'na': 'n a', 'ni': 'n i', 'nu': 'n u', 'ne': 'n e', 'no': 'n o',
    'ha': 'h a', 'hi': 'h i', 'hu': 'h u', 'fu': 'f u', 'he': 'h e', 'ho': 'h o',
    'ma': 'm a', 'mi': 'm i', 'mu': 'm u', 'me': 'm e', 'mo': 'm o',
    'ya': 'y a', 'yu': 'y u', 'yo': 'y o',
    'ra': 'r a', 'ri': 'r i', 'ru': 'r u', 're': 'r e', 'ro': 'r o',
    'wa': 'w a', 'wi': 'w i', 'we': 'w e', 'wo': 'w o',
    'n': 'N',
    'ga': 'g a', 'gi': 'g i', 'gu': 'g u', 'ge': 'g e', 'go': 'g o',
    'za': 'z a', 'zi': 'j i', 'ji': 'j i', 'zu': 'z u', 'ze': 'z e', 'zo': 'z o',
    'da': 'd a', 'di': 'd i', 'du': 'd u', 'de': 'd e', 'do': 'd o',
    'ba': 'b a', 'bi': 'b i', 'bu': 'b u', 'be': 'b e', 'bo': 'b o',
    'pa': 'p a', 'pi': 'p i', 'pu': 'p u', 'pe': 'p e', 'po': 'p o',
    'kya': 'ky a', 'kyu': 'ky u', 'kyo': 'ky o',
    'sha': 'sh a', 'shu': 'sh u', 'sho': 'sh o',
    'cha': 'ch a', 'chu': 'ch u', 'cho': 'ch o',
    'nya': 'ny a', 'nyu': 'ny u', 'nyo': 'ny o',
    'hya': 'hy a', 'hyu': 'hy u', 'hyo': 'hy o',
    'mya': 'my a', 'myu': 'my u', 'myo': 'my o',
    'rya': 'ry a', 'ryu': 'ry u', 'ryo': 'ry o',
    'gya': 'gy a', 'gyu': 'gy u', 'gyo': 'gy o',
    'ja': 'j a', 'ju': 'j u', 'jo': 'j o',
    'bya': 'by a', 'byu': 'by u', 'byo': 'by o',
    'pya': 'py a', 'pyu': 'py u', 'pyo': 'py o',
    'cl': 'cl',
  };

  const sortedKeys = Object.keys(ROMAJI_MAP).sort((a, b) => b.length - a.length);

  function romajiToPhonemes(text) {
    text = kanaToRomaji(text).toLowerCase().trim();
    if (!text) return '';

    const phonemes = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === '-') {
        const last = phonemes.length ? phonemes[phonemes.length - 1] : null;
        if (last) {
          const vowel = last.split(' ').pop();
          if ('aiueo'.includes(vowel)) phonemes.push(vowel);
        }
        i++;
        continue;
      }
      let matched = false;
      for (const key of sortedKeys) {
        if (text.startsWith(key, i)) {
          phonemes.push(ROMAJI_MAP[key]);
          i += key.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        i++;
      }
    }
    return phonemes.join(' ');
  }

  return { romajiToPhonemes };
})();
