const bugcheckCodes = require('../knowledgeBase/bugcheckCodes.json');
const eventSolutions = require('../knowledgeBase/eventSolutions.json');

/**
 * Formats a decimal or hex number to 0x000000XX format
 */
function normalizeBugcheckHex(code) {
  if (!code) return '0x00000000';
  let num = typeof code === 'string' ? parseInt(code, code.startsWith('0x') ? 16 : 10) : code;
  if (isNaN(num)) return code;
  return '0x' + num.toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Helper to parse temperature and ACPI zone from Event 86/88 messages
 */
function parseThermalDetails(message = '') {
  let tempKelvin = null;
  let tempCelsius = null;
  let tempFahrenheit = null;
  let thermalZone = 'ACPI Thermal Zone';

  const crtMatch = message.match(/_CRT\s*=\s*(\d+)K?/i);
  if (crtMatch) {
    tempKelvin = parseInt(crtMatch[1], 10);
    tempCelsius = Math.round(tempKelvin - 273.15);
    tempFahrenheit = Math.round((tempCelsius * 9/5) + 32);
  }

  const zoneMatch = message.match(/ACPI Thermal Zone\s*=\s*([^\r\n]+)/i);
  if (zoneMatch) {
    thermalZone = zoneMatch[1].trim();
  }

  return { tempKelvin, tempCelsius, tempFahrenheit, thermalZone };
}

/**
 * Main analysis function that ingests raw telemetry and produces plain-English diagnoses
 */
function analyzeDiagnostics(events = [], deviceStatus = {}, storageData = {}, systemSummary = {}) {
  const incidents = [];

  // 0. Pre-index all Critical Thermal Events for multi-event correlation
  const thermalShutdowns = [];
  if (Array.isArray(events)) {
    for (const evt of events) {
      if ((evt.Id === 86 || evt.Id === 88) && (evt.ProviderName || '').includes('Kernel-Power')) {
        thermalShutdowns.push({
          time: new Date(evt.TimeCreated).getTime(),
          event: evt,
          ...parseThermalDetails(evt.Message)
        });
      }
    }
  }

  // 1. Process Windows System and Application Events
  if (Array.isArray(events)) {
    for (const evt of events) {
      const timestamp = evt.TimeCreated;
      const id = evt.Id;
      const provider = evt.ProviderName || '';
      const message = evt.Message || '';
      const eventData = evt.EventData || {};

      // Event 41: Kernel-Power (Unexpected Reboot / Power Cut)
      if (id === 41 && provider.includes('Kernel-Power')) {
        const rawBugcheck = eventData.BugcheckCode || '0';
        const bugcheckDec = parseInt(rawBugcheck, 10) || 0;

        if (bugcheckDec === 0) {
          // Hard power cut (tripped PSU, wall power lost, or forced hard reboot)
          incidents.push({
            id: `evt-41-hard-${timestamp}`,
            timestamp,
            category: 'power',
            severity: 'critical',
            title: eventSolutions.Event_41_HardPowerLoss.title,
            description: eventSolutions.Event_41_HardPowerLoss.description,
            likelyCauses: eventSolutions.Event_41_HardPowerLoss.likelyCauses,
            remediationSteps: eventSolutions.Event_41_HardPowerLoss.remediationSteps,
            technicalDetails: {
              eventId: id,
              provider,
              bugcheckCode: '0x00000000 (0 - No Blue Screen)',
              powerButtonTimestamp: eventData.PowerButtonTimestamp || '0',
              sleepInProgress: eventData.SleepInProgress || '0'
            }
          });
        } else {
          // Crash with BugCheck code
          const hexCode = normalizeBugcheckHex(bugcheckDec);
          const knownInfo = bugcheckCodes[hexCode] || bugcheckCodes[hexCode.toLowerCase()];

          incidents.push({
            id: `evt-41-bsod-${timestamp}`,
            timestamp,
            category: knownInfo?.category || 'bsod',
            severity: 'critical',
            title: knownInfo?.title || `Blue Screen Crash (BugCheck ${hexCode})`,
            description: knownInfo?.description || `The PC experienced a kernel stop error with code ${hexCode}. Windows restarted after logging a crash dump.`,
            likelyCauses: knownInfo?.likelyCauses || [
              'Kernel driver instability or memory corruption',
              'Hardware malfunction or unstable voltage'
            ],
            remediationSteps: knownInfo?.remediationSteps || [
              'Check Windows Minidump file located in C:\\Windows\\Minidump for specific driver names.',
              'Update hardware drivers and BIOS firmware to the latest revisions.',
              'Run `sfc /scannow` in Admin PowerShell to repair corrupted system files.'
            ],
            technicalDetails: {
              eventId: id,
              provider,
              bugcheckCode: hexCode,
              param1: eventData.BugcheckParameter1,
              param2: eventData.BugcheckParameter2,
              param3: eventData.BugcheckParameter3,
              param4: eventData.BugcheckParameter4
            }
          });
        }
      }

      // Event 6008: Unexpected Shutdown
      else if (id === 6008) {
        incidents.push({
          id: `evt-6008-${timestamp}`,
          timestamp,
          category: 'power',
          severity: 'warning',
          title: eventSolutions.Event_6008.title,
          description: eventSolutions.Event_6008.description,
          likelyCauses: eventSolutions.Event_6008.likelyCauses,
          remediationSteps: eventSolutions.Event_6008.remediationSteps,
          technicalDetails: { eventId: id, provider, rawMessage: message }
        });
      }

      // Event 86 / 88: Critical Thermal Emergency Shutdown or Hibernate
      else if ((id === 86 || id === 88) && provider.includes('Kernel-Power')) {
        const { tempKelvin, tempCelsius, tempFahrenheit, thermalZone } = parseThermalDetails(message);
        const tempFormatted = tempCelsius ? `${tempCelsius}°C / ${tempFahrenheit}°F` : 'Critical Temperature';

        incidents.push({
          id: `evt-thermal-shutdown-${timestamp}`,
          timestamp,
          category: 'thermal',
          severity: 'critical',
          title: `🚨 Emergency Thermal Shutdown (ACPI Trip: ${tempFormatted})`,
          description: `Windows executed an emergency thermal shutdown at ${new Date(timestamp).toLocaleTimeString()} because the CPU reached its critical thermal trip point (${tempFormatted}, _CRT: ${tempKelvin}K) in thermal zone '${thermalZone}'. To protect the physical processor and motherboard from permanent silicon damage, the kernel immediately instructed shutdown.exe to safely shut down the system.`,
          likelyCauses: eventSolutions.Event_86_CriticalThermal.likelyCauses,
          remediationSteps: eventSolutions.Event_86_CriticalThermal.remediationSteps,
          technicalDetails: {
            eventId: id,
            provider,
            thermalZone,
            criticalTempKelvin: tempKelvin,
            criticalTempCelsius: tempCelsius,
            criticalTempFahrenheit: tempFahrenheit,
            rawMessage: message
          }
        });
      }

      // Event 1074: Shutdown / Restart Analysis & Correlation
      else if (id === 1074) {
        const evtTime = new Date(timestamp).getTime();
        // Check if there was an emergency thermal shutdown within 120 seconds of this 1074
        const correlatedThermal = thermalShutdowns.find(t => Math.abs(t.time - evtTime) < 120000);

        if (correlatedThermal) {
          // Suppress the misleading "Normal / Planned System Shutdown" label because this 1074
          // was triggered by shutdown.exe on behalf of the critical thermal safety mechanism!
          continue;
        }

        const isLocalService = message.includes('NT AUTHORITY\\LOCAL SERVICE') || message.includes('NT AUTHORITY\\SYSTEM');
        const isUpdate = message.includes('WindowsUpdate') || message.includes('Update');

        if (isUpdate) {
          incidents.push({
            id: `evt-1074-${timestamp}`,
            timestamp,
            category: 'power',
            severity: 'info',
            title: `Windows Update Automated Restart`,
            description: `Windows initiated a scheduled restart to complete installing system software updates.`,
            likelyCauses: ['Windows Update completed package installation'],
            remediationSteps: ['No action required. This was a healthy update reboot.'],
            technicalDetails: { eventId: id, provider, rawMessage: message }
          });
        } else if (isLocalService) {
          incidents.push({
            id: `evt-1074-${timestamp}`,
            timestamp,
            category: 'power',
            severity: 'warning',
            title: `Automated System Shutdown (Local Service / System)`,
            description: `A background system service or automated script executed shutdown.exe. (Not clicked by user).`,
            likelyCauses: [
              'System maintenance task or background service trigger',
              'Low battery shutdown or ACPI hardware signal'
            ],
            remediationSteps: [
              'Review coinciding logs around this timestamp to see which service requested shutdown.'
            ],
            technicalDetails: { eventId: id, provider, rawMessage: message }
          });
        } else {
          let reason = message.includes('restart') ? 'Clean Restart' : 'Clean Power Off';
          incidents.push({
            id: `evt-1074-${timestamp}`,
            timestamp,
            category: 'power',
            severity: 'info',
            title: `User-Initiated Planned Shutdown: ${reason}`,
            description: message || eventSolutions.Event_1074.description,
            likelyCauses: eventSolutions.Event_1074.likelyCauses,
            remediationSteps: eventSolutions.Event_1074.remediationSteps,
            technicalDetails: { eventId: id, provider, rawMessage: message }
          });
        }
      }

      // Event 4101: Display Driver Stopped Responding (TDR)
      else if (id === 4101 && provider.toLowerCase().includes('display')) {
        incidents.push({
          id: `evt-4101-${timestamp}`,
          timestamp,
          category: 'gpu',
          severity: 'warning',
          title: eventSolutions.Event_4101.title,
          description: eventSolutions.Event_4101.description,
          likelyCauses: eventSolutions.Event_4101.likelyCauses,
          remediationSteps: eventSolutions.Event_4101.remediationSteps,
          technicalDetails: { eventId: id, provider, rawMessage: message }
        });
      }

      // WHEA Hardware & PCIe Bus Errors (Event 17, 18, 19, 47)
      else if ([17, 18, 19, 47].includes(id) && provider.includes('WHEA')) {
        incidents.push({
          id: `evt-whea-${id}-${timestamp}`,
          timestamp,
          category: 'hardware',
          severity: 'critical',
          title: `${eventSolutions.Event_WHEA_PCIe.title} (Event ${id})`,
          description: message || eventSolutions.Event_WHEA_PCIe.description,
          likelyCauses: eventSolutions.Event_WHEA_PCIe.likelyCauses,
          remediationSteps: eventSolutions.Event_WHEA_PCIe.remediationSteps,
          technicalDetails: { eventId: id, provider, rawMessage: message, eventData }
        });
      }

      // Event 37: CPU Thermal / Power Throttling
      else if (id === 37 && provider.includes('Kernel-Processor-Power')) {
        incidents.push({
          id: `evt-37-${timestamp}`,
          timestamp,
          category: 'thermal',
          severity: 'warning',
          title: eventSolutions.Event_37_Throttling.title,
          description: message || eventSolutions.Event_37_Throttling.description,
          likelyCauses: eventSolutions.Event_37_Throttling.likelyCauses,
          remediationSteps: eventSolutions.Event_37_Throttling.remediationSteps,
          technicalDetails: { eventId: id, provider, rawMessage: message }
        });
      }

      // Event 2004: Resource Exhaustion (Out of Virtual Memory)
      else if (id === 2004) {
        incidents.push({
          id: `evt-2004-${timestamp}`,
          timestamp,
          category: 'memory',
          severity: 'warning',
          title: eventSolutions.Event_2004_OOM.title,
          description: message || eventSolutions.Event_2004_OOM.description,
          likelyCauses: eventSolutions.Event_2004_OOM.likelyCauses,
          remediationSteps: eventSolutions.Event_2004_OOM.remediationSteps,
          technicalDetails: { eventId: id, provider, rawMessage: message }
        });
      }

      // Disk I/O & Controller Retries (Event 153, 129, 11, 7)
      else if ([153, 129, 11, 7].includes(id) && ['disk', 'storahci', 'nvme'].includes(provider.toLowerCase())) {
        incidents.push({
          id: `evt-disk-${id}-${timestamp}`,
          timestamp,
          category: 'storage',
          severity: 'critical',
          title: `${eventSolutions.Event_Storage_Error.title} (${provider} Event ${id})`,
          description: message || eventSolutions.Event_Storage_Error.description,
          likelyCauses: eventSolutions.Event_Storage_Error.likelyCauses,
          remediationSteps: eventSolutions.Event_Storage_Error.remediationSteps,
          technicalDetails: { eventId: id, provider, rawMessage: message }
        });
      }

      // Event 1000: Application Crash
      else if (id === 1000 && provider.includes('Application Error')) {
        // Extract faulting app
        const appName = eventData.AppName || 'Application';
        const modName = eventData.ModName || 'Unknown Module';

        incidents.push({
          id: `evt-1000-${timestamp}`,
          timestamp,
          category: 'app',
          severity: 'info',
          title: `Application Crash: ${appName}`,
          description: `The application '${appName}' crashed due to an exception in module '${modName}'.`,
          likelyCauses: eventSolutions.Event_1000_AppCrash.likelyCauses,
          remediationSteps: eventSolutions.Event_1000_AppCrash.remediationSteps,
          technicalDetails: {
            eventId: id,
            faultingApp: appName,
            faultingModule: modName,
            exceptionCode: eventData.ExceptionCode,
            rawMessage: message
          }
        });
      }
    }
  }

  // Helper to ensure array
  const toArray = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object' && Object.keys(v).length > 0) return [v];
    return [];
  };

  // 2. Process Problem Devices (Hardware Disconnection, Code 43 / 45)
  const problemDevices = toArray(deviceStatus?.ProblemDevices);
  for (const dev of problemDevices) {
    if (!dev || !dev.ErrorCode) continue;
    const isGPU = (dev.Name || '').toLowerCase().includes('nvidia') ||
                  (dev.Name || '').toLowerCase().includes('radeon') ||
                  (dev.Name || '').toLowerCase().includes('geforce') ||
                  (dev.Name || '').toLowerCase().includes('intel') ||
                  (dev.ClassGuid || '') === '{4d36e968-e325-11ce-bfc1-08002be10318}';

    if (dev.ErrorCode === 43) {
      incidents.push({
        id: `dev-code43-${dev.DeviceID || dev.Name}`,
        timestamp: new Date().toISOString(),
        category: isGPU ? 'gpu' : 'hardware',
        severity: 'critical',
        title: isGPU ? `GPU Error Code 43: Device Stopped by Windows` : `Hardware Problem Code 43: ${dev.Name}`,
        description: `Windows has stopped this device because it has reported problems (Code 43). For graphics cards, this frequently points to severe driver corruption, insufficient PCIe power, or unseated hardware.`,
        likelyCauses: [
          'Corrupted or conflicting graphics display driver',
          'Graphics card sagging or partially unseated in the PCIe x16 slot',
          'Loose or damaged 12VHPWR / 8-pin PCIe power cable',
          'Firmware/VBIOS issue or hardware defect'
        ],
        remediationSteps: [
          'Reseat the graphics card: Power off PC, unlatch and remove the GPU, then press firmly into the primary PCIe slot until the latch clicks.',
          'Check power: Ensure all power cables are plugged in tight with no loose pins.',
          'Perform a Clean Driver Wipe using Display Driver Uninstaller (DDU) in Safe Mode.',
          'Install the latest WHQL driver directly from NVIDIA/AMD/Intel website.'
        ],
        technicalDetails: dev
      });
    } else if (dev.ErrorCode === 45) {
      incidents.push({
        id: `dev-code45-${dev.DeviceID || dev.Name}`,
        timestamp: new Date().toISOString(),
        category: isGPU ? 'gpu' : 'hardware',
        severity: 'critical',
        title: `Hardware Device Disconnected (Code 45): ${dev.Name}`,
        description: `This hardware device is not connected to the computer (Code 45). If this device was previously installed internally, it has lost connection with the motherboard bus.`,
        likelyCauses: [
          'Device is physically unseated or disconnected from PCIe/M.2 slot',
          'Loose internal power or data cable',
          'PCIe slot latch loosened due to GPU weight/sag'
        ],
        remediationSteps: [
          'Power down the system completely and unplug from wall.',
          'Inspect the card or drive inside the chassis to ensure it has not slipped out of its connector.',
          'Reseat firmly and secure retention screws and anti-sag bracket.'
        ],
        technicalDetails: dev
      });
    }
  }

  // 3. Process Storage Reliability & Health
  const disks = toArray(storageData?.Disks);
  for (const disk of disks) {
    if (!disk) continue;
      if (disk.HealthStatus && disk.HealthStatus.toLowerCase() !== 'healthy') {
        incidents.push({
          id: `disk-unhealthy-${disk.DeviceId}`,
          timestamp: new Date().toISOString(),
          category: 'storage',
          severity: 'critical',
          title: `Critical Drive Degradation: ${disk.FriendlyName}`,
          description: `Physical disk health is reporting status: ${disk.HealthStatus} (Operational: ${disk.OperationalStatus}).`,
          likelyCauses: [
            'Drive SMART sensors have detected sector failure or imminent hardware breakdown',
            'NAND flash endurance exhausted or magnetic surface degradation'
          ],
          remediationSteps: [
            'Immediately back up all personal files, saves, and important documents to an external drive or cloud storage.',
            'Prepare a replacement SSD or HDD before this drive enters read-only lock or fails completely.',
            'Run manufacturer diagnostic tools (Samsung Magician, Western Digital Dashboard, or Crucial Storage Executive).'
          ],
          technicalDetails: disk
        });
      }

      if (disk.WearPercent !== null && disk.WearPercent > 80) {
        incidents.push({
          id: `disk-wear-${disk.DeviceId}`,
          timestamp: new Date().toISOString(),
          category: 'storage',
          severity: 'warning',
          title: `High SSD Wear Detected: ${disk.FriendlyName} (${disk.WearPercent}% Used)`,
          description: `This SSD has consumed ${disk.WearPercent}% of its manufacturer-rated write endurance limit.`,
          likelyCauses: [
            'Heavy sustained write activity over time (e.g. constant video recording, large cache writes, or swap usage)'
          ],
          remediationSteps: [
            'Monitor this drive regularly and verify your automatic backup plan is active.',
            'Plan for drive replacement once wear approaches 95-100%.'
          ],
          technicalDetails: disk
        });
      }
    }

  // Deduplicate and sort incidents by timestamp descending
  const uniqueIncidents = [];
  const seenIds = new Set();
  for (const inc of incidents) {
    if (!seenIds.has(inc.id)) {
      seenIds.add(inc.id);
      uniqueIncidents.push(inc);
    }
  }

  uniqueIncidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Determine overall health status
  const hasCritical = uniqueIncidents.some(i => i.severity === 'critical');
  const hasWarning = uniqueIncidents.some(i => i.severity === 'warning');

  let overallHealth = {
    status: 'healthy',
    label: 'All Systems Normal',
    color: 'emerald',
    summary: 'No critical crashes, unexpected power cuts, or hardware disconnects detected.'
  };

  if (hasCritical) {
    overallHealth = {
      status: 'critical',
      label: 'Attention Needed',
      color: 'rose',
      summary: 'Critical events detected (unexpected shutdown, BSOD, or hardware fault). Review diagnostic actions below.'
    };
  } else if (hasWarning) {
    overallHealth = {
      status: 'warning',
      label: 'Minor Warnings Detected',
      color: 'amber',
      summary: 'System is running, but warnings were detected (driver recoveries, throttling, or high wear).'
    };
  }

  return {
    overallHealth,
    incidents: uniqueIncidents,
    systemSummary,
    storageData,
    deviceStatus
  };
}

module.exports = {
  analyzeDiagnostics,
  normalizeBugcheckHex
};
