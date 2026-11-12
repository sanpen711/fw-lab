; The executable stays in place during updates. Leave the user's shortcuts alone.
!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $NoShortcutMode <> 1
    CreateDirectory "$SMPROGRAMS\${STARTMENUFOLDER}"
    CreateShortcut "$SMPROGRAMS\${STARTMENUFOLDER}\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"

    ${If} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${EndIf}

    ${If} ${FileExists} "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCTNAME}.lnk"
      !insertmacro SetShortcutTarget "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${EndIf}

    ${If} ${FileExists} "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\fw-lab-desktop.lnk"
      !insertmacro SetShortcutTarget "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\fw-lab-desktop.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${EndIf}
  ${EndIf}
!macroend
