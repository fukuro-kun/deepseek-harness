# Sicherheit
[English](SAFETY.md) | [中文](SAFETY.zh.md) | Deutsch


## Experimenteller Status

DeepSeek Harness ist experimentelle Developer-Preview-Software. Sie wurde keinem Sicherheitsaudit unterzogen und darf nicht als sicher oder produktionsbereit behandelt werden.

Das Projekt kann modellgenerierten Code und Befehle ausführen, Drittanbieter-Plugins laden und auf Netzwerk, Prozesse, Credentials und Dateien zugreifen, die ihm zur Verfügung gestellt werden. Fehlerhafte Modellausgaben, Defekte, Fehlkonfigurationen, bösartige Eingaben oder nicht vertrauenswürdige Plugins können den Host-Computer beschädigen, Dateien verändern oder löschen, Daten oder Credentials offenlegen oder andere unbeabsichtigte Effekte verursachen.

## Grenzen der Sandbox

Sandboxing, Approval-Prompts und Permission-Controls können das Risiko reduzieren, garantieren aber weder Isolation noch Schutz vor Schäden. Selbst korrekt durchgesetzte Einschränkungen können Ressourcen nicht schützen, auf die das Projekt zugreifen darf.

Verlasse dich bei nicht vertrauenswürdigen Workloads nicht auf DeepSeek Harness als einzige Sicherheitskontrolle.

## Verantwortungsvolle Nutzung

- Führe das Projekt mit den geringsten erforderlichen Privilegien und Zugriffsrechten aus.
- Bevorzuge eine wegwerfbare virtuelle Maschine, einen Container oder eine dedizierte Umgebung.
- Halte Backups der Dateien vor, auf die das Projekt zugreifen kann.
- Lege sensible Credentials oder Daten nur dann offen, wenn du das Risiko akzeptierst.
- Prüfe Plugins, Konfiguration und vorgeschlagene Befehle, bevor du ihre Ausführung erlaubst.

## Keine Gewährleistung oder Haftung

Die Nutzung von DeepSeek Harness erfolgt auf eigenes Risiko. Die Software wird ohne Gewährleistung unter der [MIT License](LICENSE) bereitgestellt. Soweit das anwendbare Recht es zulässt, haften die Autoren und Urheberrechtsinhaber nicht für Schäden an Computern, Verlust oder Offenlegung von Daten, Verlust von Dateien oder andere Schäden, die aus der Nutzung des Projekts entstehen.
