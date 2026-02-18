/**
 * assets/js/profil.js
 * Handle komunikasi API khusus untuk Profile User
 * MODE: STRICT API (Tanpa Dummy Data)
 */

const ProfileAPI = {
    baseUrl: "http://caraka-biroumumpbj.kemendikdasmen.go.id/api",

    /**
     * Mengambil data profil user terbaru dari server
     * @param {string} token - Token akses user (Bearer token)
     */
    getProfile: async function(token) {
        if (!token) return null;

        try {
            console.log(`[ProfileAPI] Fetching: ${this.baseUrl}/profile.php`);

            const response = await fetch(`${this.baseUrl}/profile.php`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const result = await response.json();
            
            console.log("[ProfileAPI] Response:", result);

            if (result.status === 'success' && result.data) {
                return result.data;
            } else {
                console.warn("[ProfileAPI] Format response tidak sesuai atau data kosong.");
                return null;
            }
        } catch (error) {
            console.error("[ProfileAPI] Gagal mengambil profil:", error);
            return null; 
        }
    }
};

window.ProfileAPI = ProfileAPI;