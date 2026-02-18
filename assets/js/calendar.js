/**
 * assets/js/kalender.js
 * (Pastikan nama file ini kalender.js)
 */

const CalendarAPI = {
    baseUrl: "http://caraka-biroumumpbj.kemendikdasmen.go.id/api",
    
    _cache: {},

    getHolidays: async function(month, year) {
        const cacheKey = `${year}-${month}`;

        if (this._cache[cacheKey]) {
            return this._cache[cacheKey];
        }

        try {
            const strMonth = String(month).padStart(2, '0');
            console.log(`[CalendarAPI] Fetching: ${this.baseUrl}/calendar.php?month=${strMonth}&year=${year}`);
            
            const response = await fetch(`${this.baseUrl}/calendar.php?month=${strMonth}&year=${year}`);
            
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const result = await response.json();

            if (result.status === 'success' && result.data && result.data.holidays) {
                let holidays = result.data.holidays;

                                const overrides = {
                    "2026-02-16": "Cuti Bersama Imlek",
                    "2026-03-18": "Cuti Bersama Nyepi",
                    "2026-03-20": "Cuti Bersama Idul Fitri",
                    "2026-03-23": "Cuti Bersama Idul Fitri",
                    "2026-03-24": "Cuti Bersama Idul Fitri",
                    "2026-05-15": "Cuti Bersama Kenaikan Yesus",
                    "2026-05-28": "Cuti Bersama Idul Adha",
                    "2026-12-26": "Cuti Bersama Natal"
                };

                for (const [date, newName] of Object.entries(overrides)) {
                    if (holidays[date]) {
                        holidays[date].type = 'cuti';
                    } else {
                        holidays[date] = {
                            name: newName,
                            type: 'cuti'
                        };
                    }
                }

                this._cache[cacheKey] = holidays;
                return holidays;
            } else {
                return {}; 
            }
        } catch (error) {
            console.error("[CalendarAPI] Error:", error);
            return {}; 
        }
    }
};

window.CalendarAPI = CalendarAPI;