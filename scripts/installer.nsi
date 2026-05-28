; SmartBrowser - NSIS installer script.
;
; Wraps the hand-built win-unpacked folder into a single Setup .exe, the same
; way Chrome ships: a per-user install (no admin / UAC prompt) into
; %LOCALAPPDATA%\Programs\SmartBrowser, with Start Menu + Desktop shortcuts,
; an uninstaller, and an Add/Remove Programs entry.
;
; Build (from repo root):
;   makensis /DVERSION=1.0.13 /DSRCDIR=dist_electron\SmartBrowser \
;            /DOUTFILE=dist_electron\SmartBrowser-Setup-1.0.13-win-x64.exe \
;            scripts\installer.nsi
;
; Silent install (used by the in-app auto-updater):
;   SmartBrowser-Setup-<ver>-win-x64.exe /S

Unicode true

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef SRCDIR
  !define SRCDIR "dist_electron\SmartBrowser"
!endif
!ifndef OUTFILE
  !define OUTFILE "dist_electron\SmartBrowser-Setup.exe"
!endif
!ifndef ICONFILE
  !define ICONFILE "build\icon.ico"
!endif

!define APP_NAME    "SmartBrowser"
!define APP_EXE     "SmartBrowser.exe"
!define PUBLISHER   "SmartBrowser"
!define UNINST_KEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
SetCompressor /SOLID lzma
ShowInstDetails hide
ShowUninstDetails hide
BrandingText "${APP_NAME} ${VERSION}"

; Installer and uninstaller executable icons — same source as the app .ico
; built by scripts/build-icons.js.
Icon         "${ICONFILE}"
UninstallIcon "${ICONFILE}"

!include "MUI2.nsh"

!define MUI_ICON "${ICONFILE}"
!define MUI_UNICON "${ICONFILE}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; -----------------------------------------------------------------------------
; KillSmartBrowser - terminate any running SmartBrowser.exe processes (incl.
; Electron renderer/GPU/utility helpers, which all share the same image name)
; so we can overwrite the EXE without "Error opening file for writing".
;
; Runs hidden via nsExec - no console window, works in both silent + UI mode.
; Two passes: a graceful taskkill, then a force kill + tree kill for any
; lingering helpers, with a short sleep between to let handles drop.
; -----------------------------------------------------------------------------
!macro _KillSmartBrowser
  DetailPrint "Closing any running SmartBrowser instances..."
  nsExec::ExecToLog 'taskkill /IM "${APP_EXE}"'
  Sleep 500
  nsExec::ExecToLog 'taskkill /F /T /IM "${APP_EXE}"'
  Sleep 800
!macroend

Function .onInit
  !insertmacro _KillSmartBrowser
FunctionEnd

Function un.onInit
  !insertmacro _KillSmartBrowser
FunctionEnd

Section "Install"
  ; Belt-and-braces: kill again in case the user launched the app between
  ; the .onInit prompt and clicking "Install".
  !insertmacro _KillSmartBrowser

  ; Remove any previous install in this dir first (clean upgrades).
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*"

  CreateShortCut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\${APP_NAME}"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
