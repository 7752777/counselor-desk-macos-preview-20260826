!include "FileFunc.nsh"
!insertmacro un.GetParameters
!insertmacro un.GetOptions

; Assisted uninstalls explicitly choose whether user data is retained.
; Silent uninstalls retain data unless an administrator deliberately passes
; /DELETEUSERDATA=1. This makes managed deletion auditable and testable.
!macro customUnInstall
  ${GetParameters} $R0
  ${GetOptions} $R0 "/DELETEUSERDATA=" $R1
  StrCmp $R1 "1" cwbRemoveUserData

  ; Silent uninstalls keep data by default. Assisted uninstalls must ask.
  IfSilent cwbUninstallChoiceDone
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除本机数据和附件？$\r$\n选择“否”仅卸载程序并保留数据（推荐）。" /SD IDNO IDYES cwbRemoveUserData
  Goto cwbUninstallChoiceDone

  cwbRemoveUserData:
  ; Automated deployments can provide the exact Electron user-data directory.
  ; Otherwise retain the current-user locations used by released builds.
  ReadEnvStr $R2 "CWB_DESKTOP_USER_DATA"
  StrCmp $R2 "" cwbRemoveDefaultUserData
  RMDir /r "$R2"
  Goto cwbUninstallChoiceDone

  cwbRemoveDefaultUserData:
  SetShellVarContext current
  RMDir /r "$APPDATA\Counselor Desk"
  RMDir /r "$APPDATA\counselor-desk"
  DetailPrint "已删除本机数据和附件。"
  cwbUninstallChoiceDone:
!macroend
