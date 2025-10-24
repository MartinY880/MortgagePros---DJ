import { authApi } from '../services/api';

export default function LandingPage() {
  const handleLogin = async () => {
    try {
      const response = await authApi.getAuthUrl();
      console.log('Auth response:', response.data); // Debug log
      
      if (response.data && response.data.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        console.error('No authUrl in response:', response);
        alert('Failed to get Spotify login URL. Please check if the backend server is running.');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Failed to connect: ${errorMsg}\n\nMake sure the backend server is running and accessible.`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-spotify-black via-spotify-dark to-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8 flex justify-center">
          <img 
            src="https://mtgpros.com/wp-content/uploads/2023/04/MTGProsSiteLogo.webp" 
            alt="MortgagePros Logo" 
            className="h-24 w-auto"
          />
        </div>
        
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-spotify-green to-green-400 bg-clip-text text-transparent">
          MortgagePros Jukebox
        </h1>
        
        <p className="text-xl text-gray-300 mb-8">
          Create collaborative playlists with your friends. Vote on songs, queue tracks, and let everyone be the DJ!
        </p>
        
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="bg-spotify-green hover:bg-green-500 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg"
          >
            Connect with Spotify
          </button>
          
          <p className="text-sm text-gray-400">
            Spotify Premium required for playback control
          </p>
        </div>
        
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="bg-spotify-gray p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-2 text-spotify-green">🎪 Host Sessions</h3>
            <p className="text-gray-300">Create a jukebox session and share the code with friends</p>
          </div>
          
          <div className="bg-spotify-gray p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-2 text-spotify-green">🎵 Add Songs</h3>
            <p className="text-gray-300">Search and add tracks to the collaborative queue</p>
          </div>
          
          <div className="bg-spotify-gray p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-2 text-spotify-green">👍 Vote</h3>
            <p className="text-gray-300">Upvote your favorites - top songs play first!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
