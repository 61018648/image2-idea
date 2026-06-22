const nextConfig = {
  reactStrictMode: true,
  // 关闭开发环境下的左下角图标
  devIndicators: false,
  transpilePackages: [],
  outputFileTracingRoot: new URL('.', import.meta.url).pathname,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig
