/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // The old Breeding and Breeding arena pages were replaced by the Pair Finder.
    return [
      { source: "/breeding", destination: "/breeding/finder", permanent: true },
      { source: "/breeding/arena", destination: "/breeding/finder", permanent: true },
    ];
  },
};

export default nextConfig;
