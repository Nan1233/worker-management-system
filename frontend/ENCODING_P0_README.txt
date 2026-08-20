KTC P0 - UTF-8 Encoding Guard

The previous P0 package referenced scripts/checkEncoding.cjs from package.json but the script file was accidentally omitted from the ZIP. This package includes the missing script.

Run from frontend:
  npm install
  npm run check:encoding
  npm run build

The guard scans frontend/src for common UTF-8 mojibake patterns while avoiding legitimate Vietnamese characters such as "ĐÃ".
