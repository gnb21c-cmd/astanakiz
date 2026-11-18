; 바탕화면 아이콘 늘 만들기 (사장님 11/18)
; electron-builder 는 이미 설치된 판 위에 다시 설치하거나 업데이트할 때 바탕화면 아이콘을 '있던 것을 그대로 둘 뿐' 새로 만들지 않음
;   → 11/17 저녁 자동 업데이트 때 아이콘이 없어진 뒤로는 다시 설치해도 안 생겼음
; 그래서 설치가 끝날 때 아이콘이 없으면 늘 만듦 (앱도 켤 때마다 없으면 다시 만듦 — main.js ensureDesktopIcon)
!macro customInstall
  ${ifNot} ${isNoDesktopShortcut}
    ${ifNot} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endIf}
  ${endIf}
!macroend
