' Runs the service watchdog with no console window (wscript = GUI subsystem).
' A direct powershell -File task action flashes a conhost/WindowsTerminal window.
CreateObject("Wscript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\LOYAL\Documents\hackathon\bot-oracle\scripts\start-services.ps1""", 0, False
