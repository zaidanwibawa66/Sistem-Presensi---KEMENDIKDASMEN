/**
 * PRESENSI API
 */
const PresensiAPI = {
    baseUrl: "http://caraka-biroumumpbj.kemendikdasmen.go.id/api",

    async submit(token, payload) {
        try {
            const res = await fetch(`${this.baseUrl}/clock.php`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            console.log("CLOCK API:", data);

            if (!res.ok) throw data;
            return data;
        } catch (err) {
            console.error("❌ Presensi API error:", err);
            return null;
        }
    },

    async getHistory(token) {
        try {
            const res = await fetch(`${this.baseUrl}/history.php`, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/json"
                }
            });

            const data = await res.json();
            console.log("HISTORY API:", data);

            if (!res.ok) throw data;
            return data;
        } catch (err) {
            console.error("❌ History API error:", err);
            return null;
        }
    }
};

window.PresensiAPI = PresensiAPI;