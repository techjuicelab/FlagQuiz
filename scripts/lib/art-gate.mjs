import fs from 'node:fs';
import path from 'node:path';

/** 그림 내용 검사와 별개로 공개할 파일의 누락과 고아 파일을 검사한다.
 *  원장이 보류로 적은 소재(subjects 의 noArt)만 그림을 요구하지 않는다. 대신 그 자리에 파일이 있으면
 *  보류 기록이 낡은 것이므로 오류로 잡는다 — 어느 쪽이 맞는지 모른 채 지나가면 안 된다. */
export function checkArtSet(root, subjects, countryCodes, required = false) {
  const errors = [], counts = {symbol: 0, place: 0};
  const codes = new Set(countryCodes);
  const base = path.join(root, 'images');
  const dirs = {symbols: 'symbol', places: 'place'};
  if (fs.existsSync(base)) for (const entry of fs.readdirSync(base, {withFileTypes: true})) {
    if (!dirs[entry.name] || !entry.isDirectory()) errors.push('그림 폴더 밖 파일: images/' + entry.name);
  }
  for (const [dir, axis] of Object.entries(dirs)) {
    const folder = path.join(base, dir);
    const present = new Set();
    if (fs.existsSync(folder)) for (const file of fs.readdirSync(folder, {withFileTypes: true})) {
      if (file.isFile() && file.name === '.gitkeep') continue;
      const match = /^([a-z]{2})\.webp$/.exec(file.name);
      if (!file.isFile() || !match) { errors.push('허용하지 않는 그림 파일: ' + dir + '/' + file.name); continue; }
      const code = match[1];
      if (!codes.has(code) || !subjects[code]?.[axis]) errors.push('자료 없는 그림: ' + dir + '/' + file.name);
      else if (subjects[code][axis].noArt) errors.push('보류한 소재의 그림: ' + dir + '/' + file.name);
      else { present.add(code); counts[axis]++; }
    }
    if (required) for (const code of countryCodes) {
      if (subjects[code]?.[axis] && !subjects[code][axis].noArt && !present.has(code)) errors.push('필요한 그림 없음: ' + dir + '/' + code + '.webp');
    }
  }
  for (const code of codes) if (!subjects[code]?.symbol) errors.push('상징물 자료 없음: ' + code);
  for (const code of Object.keys(subjects)) if (!codes.has(code)) errors.push('목록 밖 주제 자료: ' + code);
  return {errors, counts};
}
