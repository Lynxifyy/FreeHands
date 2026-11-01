#include "freehands/kernel_backend.h"

namespace freehands {

void CpuKernelBackend::matmul(const MatrixView& a, const MatrixView& b, float* out) const {
  if (!a.valid() || !b.valid() || out == nullptr) {
    return;
  }
  // b is [cols_b, cols_a]: row j of b holds the weights for output column j.
  for (int i = 0; i < a.rows; ++i) {
    const float* a_row = a.data + static_cast<size_t>(i) * a.cols;
    float* out_row = out + static_cast<size_t>(i) * b.rows;
    for (int j = 0; j < b.rows; ++j) {
      const float* b_row = b.data + static_cast<size_t>(j) * b.cols;
      float sum = 0.0f;
      for (int k = 0; k < a.cols; ++k) {
        sum += a_row[k] * b_row[k];
      }
      out_row[j] = sum;
    }
  }
}

void CpuKernelBackend::axpy(float* y, const float* x, const float* w, const float* b,
                            size_t count, float scale) const {
  if (y == nullptr || x == nullptr || w == nullptr) {
    return;
  }
  for (size_t i = 0; i < count; ++i) {
    const float bias = b == nullptr ? 0.0f : b[i];
    y[i] += scale * (x[i] * w[i] + bias);
  }
}

const KernelBackend& CpuKernelBackend::reference() {
  static const CpuKernelBackend instance;
  return instance;
}

}  // namespace freehands
