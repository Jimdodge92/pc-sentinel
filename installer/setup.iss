#define MyAppName "PC Sentinel"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "PC Sentinel Engineering"
#define MyAppURL "https://github.com/pcsentinel"
#define MyAppExeName "PC Sentinel"
#define SourceRootDir ".."

[Setup]
AppId={{5D8A21B4-3E12-4B6A-9140-F22B18E08C8E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\PC Sentinel
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=..\dist-installer
OutputBaseFilename=PC-Sentinel-Setup
SetupIconFile=app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
DisableWelcomePage=no
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Bundled portable Node.js runtime (enables 1-click execution on any PC without Node pre-installed)
Source: "C:\Program Files\nodejs\node.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; PC Sentinel Server Code & Diagnostic Scripts (includes server/node_modules)
Source: "{#SourceRootDir}\server\*"; DestDir: "{app}\server"; Excludes: "*.exe"; Flags: ignoreversion recursesubdirs createallsubdirs
; Compiled Client Web Assets (Served by Express)
Source: "{#SourceRootDir}\client\dist\*"; DestDir: "{app}\client\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
; Application Icons & Assets
Source: "{#SourceRootDir}\installer\app_icon.ico"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "{#SourceRootDir}\installer\app_icon.png"; DestDir: "{app}\installer"; Flags: ignoreversion
; Scripts & Launchers
Source: "{#SourceRootDir}\setup-system-service.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRootDir}\enable-firewall.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRootDir}\package.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\PC Sentinel Dashboard"; Filename: "http://localhost:3500"; IconFilename: "{app}\installer\app_icon.ico"
Name: "{group}\PC Sentinel Service Setup"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\setup-system-service.ps1"""; IconFilename: "{app}\installer\app_icon.ico"
Name: "{group}\Uninstall PC Sentinel"; Filename: "{uninstallexe}"
Name: "{autodesktop}\PC Sentinel Dashboard"; Filename: "http://localhost:3500"; IconFilename: "{app}\installer\app_icon.ico"; Tasks: desktopicon

[Run]
; 1. Enable Windows Firewall for port 3500 directly via netsh (eliminates hidden console wait)
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""PC Sentinel Remote Access"" dir=in action=allow protocol=TCP localport=3500"; Flags: runhidden
; 2. Register PCSentinelService and PCSentinelShutdownTrigger as Windows System Services
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\setup-system-service.ps1"""; Flags: runhidden waituntilterminated
; 3. Launch the dashboard in browser on completion
Filename: "http://localhost:3500"; Description: "Launch PC Sentinel Dashboard"; Flags: postinstall shellexec nowait

[UninstallRun]
; Stop and unregister services upon uninstallation
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -Command ""Get-ScheduledTask -TaskName PCSentinelService -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false; Get-ScheduledTask -TaskName PCSentinelShutdownTrigger -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false; Stop-Process -Name node -Force -ErrorAction SilentlyContinue"""; Flags: runhidden waituntilterminated
