// Adjusts the Capacitor-generated android/ project. Runs after `cap add android` in the build.
// - sets versionCode/versionName from the APP_VERSION env var (or package.json version)
// - adds the small monochrome notification icon (ic_stat_dinlipi)
// - lets the WebView follow the phone's dark mode (DayNight theme)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = (process.env.APP_VERSION || pkg.version).replace(/^v/, '');
const [major = 0, minor = 0, patch = 0] = version.split('.').map(n => parseInt(n, 10) || 0);
const versionCode = major * 10000 + minor * 100 + patch;   // 1.2.3 → 10203; must always increase

const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
               .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
writeFileSync(gradlePath, gradle);

mkdirSync('android/app/src/main/res/drawable', { recursive: true });
writeFileSync('android/app/src/main/res/drawable/ic_stat_dinlipi.xml', `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="2.6"
      android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M5,12.5l4.5,4.5L19,7.5"/>
</vector>
`);

const stylesPath = 'android/app/src/main/res/values/styles.xml';
if (existsSync(stylesPath)) {
  const styles = readFileSync(stylesPath, 'utf8').replaceAll('Theme.AppCompat.Light.DarkActionBar', 'Theme.AppCompat.DayNight.DarkActionBar');
  writeFileSync(stylesPath, styles);
}

console.log(`Android project patched: version ${version} (code ${versionCode})`);
