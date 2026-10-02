# Sicherheit

[English](SAFETY.md) | [中文](SAFETY.zh.md) | Deutsch

## Experimenteller Status

DeepSeek Harness ist experimentelle Software im Developer Preview. Sie wurde keinem Sicherheitsaudit unterzogen und darf nicht als sicher oder produktionsreif betrachtet werden.

Das Projekt kann von Modellen erzeugten Code und Befehle ausführen, Drittanbieter-Plugins laden und greift auf das Netzwerk, Prozesse, Anmeldeinformationen und Dateien zu, die ihm zur Verfügung stehen. Falsche Modellausgaben, Fehler, Fehlkonfigurationen, bösartiger Eingabe oder nicht vertrauenswürdige Plugins können den Host-Computer beschädigen, Dateien ändern oder löschen, Daten oder Anmeldeinformationen offenlegen oder andere unbeabsichtigte Auswirkungen haben.

## Grenzen der Sandbox

Sandboxing, Genehmigungsfenster und Berechtigungssteuerung können das Risiko verringern, garantieren aber weder Isolation noch verhindern sie Schäden. Selbst korrekt durchgesetzte Einschränkungen schützen nicht die Ressourcen, auf die das Projekt zugreifen darf.

Stützen Sie sich nicht auf DeepSeek Harness als alleinige Sicherheitsmaßnahme für nicht vertrauenswürdige Workloads.

## Verantwortungsvolle Nutzung

- Führen Sie das Projekt mit den geringstmöglichen Berechtigungen und dem notwendigen Zugriff aus.
- Bevorzugen Sie eine Wegwerf-Virtual Machine, einen Container oder eine dedizierte Umgebung.
- Sichern Sie die Dateien, auf die das Projekt zugreifen kann.
- Legen Sie keine sensiblen Anmeldeinformationen oder Daten offen, es sei denn, Sie akzeptieren das Risiko.
- Prüfen Sie Plugins, Konfiguration und vorgeschlagene Befehle, bevor Sie deren Ausführen zulassen.

## Keine Gewähr oder Haftung

Verwenden Sie DeepSeek Harness auf eigenes Risiko. Die Software wird ohne Gewähr nach der [MIT License](LICENSE) bereitgestellt. Im weitesten von der anwendbaren Rechtsordnung zugelassenen Umfang haften die Autoren und Urheberrechtsinhaber nicht für Schäden an Computern, Verlust oder Offenlegung von Daten, Verlust von Dateien oder sonstige Schäden, die sich aus der Verwendung des Projekts ergeben.
