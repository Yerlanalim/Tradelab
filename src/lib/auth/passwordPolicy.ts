export const PASSWORD_POLICY = {
  minLength: 8,
  requireNumber: true,
  requireLetter: true,
} as const;

export const getPasswordIssues = (password: string) => {
  const issues: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) {
    issues.push(`Минимум ${PASSWORD_POLICY.minLength} символов`);
  }
  if (PASSWORD_POLICY.requireLetter && !/[a-zа-я]/i.test(password)) {
    issues.push("Нужна хотя бы одна буква");
  }
  if (PASSWORD_POLICY.requireNumber && !/\d/.test(password)) {
    issues.push("Нужна хотя бы одна цифра");
  }
  return issues;
};

export const isPasswordValid = (password: string) => getPasswordIssues(password).length === 0;
