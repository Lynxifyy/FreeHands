#ifndef FREEHANDS_KERNEL_BACKEND_H
#define FREEHANDS_KERNEL_BACKEND_H

#include <cstddef>

namespace freehands {

// A dense row-major matrix.
struct MatrixView {
  const float* data = nullptr;
  int rows = 0;
  int cols = 0;

  size_t size() const { return static_cast<size_t>(rows) * static_cast<size_t>(cols); }
  bool valid() const { return data != nullptr && rows > 0 && cols > 0; }
};

// The math the transformer needs, behind one seam.
//
// The CPU implementation below is what ships when no accelerator is linked.
// LiteRT-LM's delegate API plugs in here: a delegate implements the same two
// calls and the engine routes every matmul through it, so a GPU or NPU path
// changes no other file. Keeping the seam this narrow is what makes it
// swappable at all.
class KernelBackend {
 public:
  virtual ~KernelBackend() = default;

  // out[rows_a, cols_b] = a[rows_a, cols_a] * b[rows_a, cols_a]'
  // b is stored [cols_b, cols_a] so the second operand is addressed by output
  // column, which is the layout both the reference path and a delegate expect.
  virtual void matmul(const MatrixView& a, const MatrixView& b, float* out) const = 0;

  // y[i] += scale * (x[i] * w[i] + b[i]) elementwise, for the norms and the
  // elementwise MLP terms that are not worth a delegate round trip.
  virtual void axpy(float* y, const float* x, const float* w, const float* b,
                    size_t count, float scale) const = 0;

  virtual const char* name() const = 0;
};

// Portable scalar implementation. Always available, and the correctness
// reference any accelerated backend is checked against.
class CpuKernelBackend final : public KernelBackend {
 public:
  void matmul(const MatrixView& a, const MatrixView& b, float* out) const override;
  void axpy(float* y, const float* x, const float* w, const float* b,
            size_t count, float scale) const override;
  const char* name() const override { return "cpu"; }

  // The backend with no accelerator linked.
  static const KernelBackend& reference();
};

}  // namespace freehands

#endif  // FREEHANDS_KERNEL_BACKEND_H
