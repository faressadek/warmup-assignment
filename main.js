const fs = require("fs");
function twelveHourToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();

    let [timePart, period] = timeStr.split(" ");
    let [hour, minute, second] = timePart.split(":").map(Number);

    if (period === "am") {
        if (hour === 12) hour = 0;
    } else {
        if (hour !== 12) hour += 12;
    }

    return hour * 3600 + minute * 60 + second;
}

function durationToSeconds(durationStr) {
    durationStr = durationStr.trim();
    let [h, m, s] = durationStr.split(":").map(Number);
    return h * 3600 + m * 60 + s;
}

function secondsToDuration(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;

    let h = Math.floor(totalSeconds / 3600);
    let rem = totalSeconds % 3600;
    let m = Math.floor(rem / 60);
    let s = rem % 60;

    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function isEidPeriod(dateStr) {
    return dateStr >= "2025-04-10" && dateStr <= "2025-04-30";
}

function getDailyQuotaSeconds(dateStr) {
    if (isEidPeriod(dateStr)) {
        return 6 * 3600;
    }
    return 8 * 3600 + 24 * 60;
}

function getDayName(dateStr) {
    let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let d = new Date(dateStr);
    return days[d.getDay()];
}

function readShiftFile(textFile) {
    if (!fs.existsSync(textFile)) return [];

    let content = fs.readFileSync(textFile, "utf8").trim();
    if (content === "") return [];

    let lines = content.split("\n").filter(line => line.trim() !== "");

    return lines.map(line => {
        let parts = line.split(",").map(x => x.trim());
        return {
            driverID: parts[0],
            driverName: parts[1],
            date: parts[2],
            startTime: parts[3],
            endTime: parts[4],
            shiftDuration: parts[5],
            idleTime: parts[6],
            activeTime: parts[7],
            metQuota: parts[8] === "true",
            hasBonus: parts[9] === "true"
        };
    });
}

function writeShiftFile(textFile, records) {
    let lines = records.map(rec =>
        [
            rec.driverID,
            rec.driverName,
            rec.date,
            rec.startTime,
            rec.endTime,
            rec.shiftDuration,
            rec.idleTime,
            rec.activeTime,
            rec.metQuota,
            rec.hasBonus
        ].join(",")
    );

    fs.writeFileSync(textFile, lines.join("\n"));
}

function readRateFile(rateFile) {
    if (!fs.existsSync(rateFile)) return [];

    let content = fs.readFileSync(rateFile, "utf8").trim();
    if (content === "") return [];

    let lines = content.split("\n").filter(line => line.trim() !== "");

    return lines.map(line => {
        let parts = line.split(",").map(x => x.trim());
        return {
            driverID: parts[0],
            dayOff: parts[1],
            basePay: Number(parts[2]),
            tier: Number(parts[3])
        };
    });
}
// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    let startSec = twelveHourToSeconds(startTime);
    let endSec = twelveHourToSeconds(endTime);
    return secondsToDuration(endSec - startSec);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    let startSec = twelveHourToSeconds(startTime);
    let endSec = twelveHourToSeconds(endTime);

    let workStart = 8 * 3600;
    let workEnd = 22 * 3600;

    let idleBefore = 0;
    let idleAfter = 0;

    if (startSec < workStart) {
        idleBefore = Math.min(endSec, workStart) - startSec;
        if (idleBefore < 0) idleBefore = 0;
    }

    if (endSec > workEnd) {
        idleAfter = endSec - Math.max(startSec, workEnd);
        if (idleAfter < 0) idleAfter = 0;
    }

    return secondsToDuration(idleBefore + idleAfter);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shiftSec = durationToSeconds(shiftDuration);
    let idleSec = durationToSeconds(idleTime);
    return secondsToDuration(shiftSec - idleSec);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    let activeSec = durationToSeconds(activeTime);
    let requiredSec = getDailyQuotaSeconds(date);
    return activeSec >= requiredSec;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let records = readShiftFile(textFile);

    for (let rec of records) {
        if (rec.driverID === shiftObj.driverID && rec.date === shiftObj.date) {
            return {};
        }
    }

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quotaMet = metQuota(shiftObj.date, activeTime);

    let newRecord = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quotaMet,
        hasBonus: false
    };

    let lastIndex = -1;
    for (let i = 0; i < records.length; i++) {
        if (records[i].driverID === shiftObj.driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        records.push(newRecord);
    } else {
        records.splice(lastIndex + 1, 0, newRecord);
    }

    writeShiftFile(textFile, records);
    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let records = readShiftFile(textFile);

    for (let rec of records) {
        if (rec.driverID === driverID && rec.date === date) {
            rec.hasBonus = newValue;
            break;
        }
    }

    writeShiftFile(textFile, records);
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let records = readShiftFile(textFile);

    let foundDriver = false;
    let count = 0;
    let targetMonth = Number(month);

    for (let rec of records) {
        if (rec.driverID === driverID) {
            foundDriver = true;

            let recMonth = Number(rec.date.split("-")[1]);
            if (recMonth === targetMonth && rec.hasBonus === true) {
                count++;
            }
        }
    }

    if (!foundDriver) return -1;
    return count;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let records = readShiftFile(textFile);
    let totalSeconds = 0;

    for (let rec of records) {
        let recMonth = Number(rec.date.split("-")[1]);
        if (rec.driverID === driverID && recMonth === Number(month)) {
            totalSeconds += durationToSeconds(rec.activeTime);
        }
    }

    return secondsToDuration(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let records = readShiftFile(textFile);
    let rates = readRateFile(rateFile);

    let driverRate = rates.find(r => r.driverID === driverID);
    if (!driverRate) return "0:00:00";

    let totalRequired = 0;

    for (let rec of records) {
        let recMonth = Number(rec.date.split("-")[1]);

        if (rec.driverID === driverID && recMonth === Number(month)) {
            let dayName = getDayName(rec.date);

            if (dayName === driverRate.dayOff) continue;

            totalRequired += getDailyQuotaSeconds(rec.date);
        }
    }

    totalRequired -= bonusCount * 2 * 3600;

    if (totalRequired < 0) totalRequired = 0;

    return secondsToDuration(totalRequired);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rates = readRateFile(rateFile);
    let driverRate = rates.find(r => r.driverID === driverID);

    if (!driverRate) return 0;

    let actualSec = durationToSeconds(actualHours);
    let requiredSec = durationToSeconds(requiredHours);

    if (actualSec >= requiredSec) {
        return driverRate.basePay;
    }

    let missingSec = requiredSec - actualSec;

    let allowedMissingHours = 0;
    if (driverRate.tier === 1) allowedMissingHours = 50;
    else if (driverRate.tier === 2) allowedMissingHours = 20;
    else if (driverRate.tier === 3) allowedMissingHours = 10;
    else if (driverRate.tier === 4) allowedMissingHours = 3;

    let allowedMissingSec = allowedMissingHours * 3600;
    let billableMissingSec = missingSec - allowedMissingSec;

    if (billableMissingSec <= 0) {
        return driverRate.basePay;
    }

    let billableMissingHours = Math.floor(billableMissingSec / 3600);
    let deductionRatePerHour = Math.floor(driverRate.basePay / 185);
    let salaryDeduction = billableMissingHours * deductionRatePerHour;

    return driverRate.basePay - salaryDeduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
