/* Natural Earth v5.1.2 국가 코드 조인. 좌표는 194개국, 육지는 배제 도형까지 사용한다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const CODE_OVERRIDES = Object.freeze({
  // 현재 고정한 원본은 ISO_A2_EH → ISO_A2 → WB_A2만으로 모두 연결된다.
});

// v5.1.2 원본은 242개다. 문서의 46개에 호주 속령 도형 2개를 더해 48개를 명시한다.
// 속령도 AU 코드가 있으므로 국가 코드 매칭보다 이 배제 목록을 먼저 적용한다.
export const EXCLUDED_ADMINS = Object.freeze([
  "Aland", // 자치지역
  "American Samoa", // 속령
  "Anguilla", // 속령
  "Antarctica", // 무국적
  "Aruba", // 자치지역
  "Ashmore and Cartier Islands", // 호주 속령, ISO_A2_EH=AU지만 Australia와 별도 도형
  "Bermuda", // 속령
  "British Indian Ocean Territory", // 분쟁지역
  "British Virgin Islands", // 속령
  "Cayman Islands", // 속령
  "Cook Islands", // 기존 나라 목록에서 제외
  "Curaçao", // 자치지역
  "Falkland Islands", // 분쟁지역
  "Faroe Islands", // 속령
  "French Polynesia", // 속령
  "French Southern and Antarctic Lands", // 속령
  "Greenland", // 자치지역
  "Guam", // 속령
  "Guernsey", // 자치지역
  "Heard Island and McDonald Islands", // 속령
  "Hong Kong S.A.R.", // 자치지역
  "Indian Ocean Territories", // 호주 속령, ISO_A2_EH=AU지만 Australia와 별도 도형
  "Isle of Man", // 자치지역
  "Jersey", // 자치지역
  "Kosovo", // 견해가 갈림, README의 나라 목록 방침
  "Macao S.A.R", // 자치지역
  "Montserrat", // 속령
  "New Caledonia", // 속령
  "Niue", // 기존 나라 목록에서 제외
  "Norfolk Island", // 속령
  "Northern Cyprus", // 미승인
  "Northern Mariana Islands", // 속령
  "Palestine", // 견해가 갈림, README의 나라 목록 방침
  "Pitcairn Islands", // 속령
  "Puerto Rico", // 속령
  "Saint Barthelemy", // 속령
  "Saint Helena", // 속령
  "Saint Martin", // 속령
  "Saint Pierre and Miquelon", // 속령
  "Siachen Glacier", // 분쟁지역
  "Sint Maarten", // 자치지역
  "Somaliland", // 미승인
  "South Georgia and the Islands", // 속령
  "Taiwan", // 견해가 갈림, README의 나라 목록 방침
  "Turks and Caicos Islands", // 속령
  "United States Virgin Islands", // 속령
  "Wallis and Futuna", // 속령
  "Western Sahara", // 견해가 갈림, README의 나라 목록 방침
]);

export function readCountryCodes(root) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'data/countries.js'), 'utf8'), sandbox, { filename: 'data/countries.js' });
  const codes = sandbox.window.FQ.countries.map((country) => country.code);
  if (codes.some((code) => !/^[a-z]{2}$/.test(code)) || new Set(codes).size !== codes.length) {
    throw new Error('앱 나라 목록의 코드 형식 또는 중복 오류');
  }
  return codes;
}

export function joinFeatures(features, countryCodes) {
  const expected = new Set(countryCodes);
  const excludedAdmins = new Set(EXCLUDED_ADMINS);
  const matched = new Map();
  const excluded = [];
  const unknown = [];
  const duplicates = [];
  for (const feature of features) {
    const properties = feature.properties || {};
    const admin = properties.ADMIN;
    if (excludedAdmins.has(admin)) {
      excluded.push(feature);
      continue;
    }
    const override = CODE_OVERRIDES[admin];
    const candidate = [properties.ISO_A2_EH, properties.ISO_A2, properties.WB_A2]
      .find((value) => typeof value === 'string' && /^[A-Z]{2}$/.test(value));
    const code = override || (candidate && candidate.toLowerCase());
    if (!expected.has(code)) {
      unknown.push(admin || '(ADMIN 없음)');
    } else if (matched.has(code)) {
      duplicates.push(code + ': ' + matched.get(code).properties.ADMIN + ', ' + admin);
    } else {
      matched.set(code, feature);
    }
  }
  const missing = [...expected].filter((code) => !matched.has(code)).sort();
  const errors = [];
  if (missing.length) errors.push('매칭 안 된 국가 코드: ' + missing.join(', '));
  if (unknown.length) errors.push('미분류 지도 도형 ADMIN: ' + unknown.sort().join(', '));
  if (duplicates.length) errors.push('국가 코드 중복 매칭: ' + duplicates.join('; '));
  if (errors.length) throw new Error(errors.join('\n'));
  return { matched, excluded };
}
