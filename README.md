# Github Action: Shopify Automated PR Theme Check Reporter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Action Repository:** `ShopLab-Team/shoplab-pr-shopify-theme-check-reporter@v2`

## What it does

This GitHub Action automatically runs Shopify Theme Check against your theme code within a Pull Request using the official `@shopify/theme-check-node` library. It then posts a formatted report as an **updating comment** directly on the PR, making it easy for developers to see errors and warnings without leaving the PR interface.

This action makes use of several key components:

1.  **`@shopify/theme-check-node`**: The official Node.js library from Shopify for running theme checks programmatically. [More Info](https://github.com/Shopify/theme-tools/tree/main/packages/theme-check-node)
2.  **`actions/checkout`**: Standard action to check out your repository code.
3.  **`actions/setup-node`**: Standard action to ensure the correct Node.js version is available on the runner.
4.  **`marocchino/sticky-pull-request-comment`**: A helpful action used to post and update the report comment on the Pull Request. [More Info](https://github.com/marocchino/sticky-pull-request-comment)

## Key Features

* Runs theme checks automatically on PRs (`opened`, `synchronize`, `reopened`).
* Posts a clear summary comment to the PR (e.g., "X error(s), Y warning(s) found.").
* Groups findings by Errors (`🚨`) and Warnings (`⚠️`) if both exist.
* Formats issues clearly with relative file paths, line/column numbers, messages, and check codes.
* Provides direct **clickable links** to the specific line of code on GitHub for easy navigation.
* Includes a link back to the full GitHub Actions run for detailed logs.
* **Updates the existing comment** on subsequent commits to the PR, avoiding comment spam.
* **Fails the workflow run** if errors are detected (useful for branch protection rules).
* Optionally fails the run if warnings are detected.

## How to use

Add a job to your existing Pull Request workflow (e.g., `.github/workflows/pull-request.yml`):

```yaml
name: Pull Request Checks

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  theme-check:
    name: Run Theme Check
    runs-on: ubuntu-latest # Or your preferred runner

    # Permissions needed by the action
    permissions:
      pull-requests: write # To post comments
      contents: read      # To checkout code

    steps:
      # Step 1: Check out code using the specific PR commit SHA
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          # Checkout the specific commit from the PR head for accurate linking
          ref: ${{ github.event.pull_request.head.sha }}

      # Step 2: Run the Theme Check Reporter Action
      - name: Run Shopify Automated PR Theme Check Reporter
        # Replace with YourUsername/YourRepo@v1 once published
        uses: ShopLab-Team/shoplab-pr-shopify-theme-check-reporter@v2
        with:
          # Required: Pass the default GITHUB_TOKEN
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # Optional: Fail the action if warnings are found (default is false)
          # fail-on-warnings: 'true'
          # Optional: Specify Node.js version (default: 20.x)
          # node-version: '18.x'
          # Optional: Specify theme-check package version (default: latest)
          # theme-check-package: '@shopify/theme-check-node@1.17.0'

      # Optional: Add other steps like build or test after the check
      # - name: Build Project
      #   if: success() # Only run if theme-check passed (no errors)
      #   run: npm run build

```

## Example Comment Output

If your theme has issues, the action will post a comment similar to this:

(Note: You will need to replace the image URL above with a publicly accessible URL pointing to your example screenshot after uploading it, perhaps to your action's repository).

If no issues are found, it will post a success message:

```
## Theme Check Report for PR #XXX
**0 error(s), 0 warning(s) found.**

✅ (0 error(s), 0 warning(s) found)

[View Full Action Run Details](...)
```

## Contributing
Contributions are welcome! Please open an issue or submit a pull request in the action's repository.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.