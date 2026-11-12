/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      // Baltic Way
      {
        source: '/balticway',
        destination: 'https://v0-baltic-way-visualization.vercel.app/balticway',
      },
      {
        source: '/balticway/:path*',
        destination: 'https://v0-baltic-way-visualization.vercel.app/balticway/:path*',
      },
      // The Best People
      {
        source: '/thebestpeople',
        destination: 'https://v0-thebestpeople.vercel.app/thebestpeople',
      },
      {
        source: '/thebestpeople/:path*',
        destination: 'https://v0-thebestpeople.vercel.app/thebestpeople/:path*',
      },
      // Ruins Under the Canopy
      {
        source: '/underthecanopy',
        destination: 'https://ruins-under-the-canopy.vercel.app/',
      },
      {
        source: '/underthecanopy/:path*',
        destination: 'https://ruins-under-the-canopy.vercel.app/:path*',
      },
      // Pajtim — Move the Sun (static page in public/pajtim)
      {
        source: '/pajtim',
        destination: '/pajtim/index.html',
      },
      // The Tilted Times
      {
        source: '/thetiltedtimes',
        destination: 'https://tiltedtimes.vercel.app/thetiltedtimes',
      },
      {
        source: '/thetiltedtimes/:path*',
        destination: 'https://tiltedtimes.vercel.app/thetiltedtimes/:path*',
      },
    ]
  },
}

export default nextConfig
