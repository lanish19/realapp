# Python Scripting Environment Setup

These instructions will guide you through setting up the Python virtual environment required for running the project's Python scripts, particularly those used for data extraction and GIS processing.

## 1. Prerequisite: Python Installation

Ensure you have Python installed on your system. We recommend **Python 3.9 or newer**.

You can check your Python version by running:
```bash
python --version
# or on some systems
python3 --version
```
If you don't have Python installed, please download and install it from [python.org](https://www.python.org/downloads/).

## 2. Create a Python Virtual Environment

A virtual environment helps to isolate project-specific dependencies.

Open your terminal or command prompt in the root directory of this project.

**Create the virtual environment:**
```bash
python -m venv .venv
# If the above doesn't work, try:
# python3 -m venv .venv
```
This command creates a directory named `.venv` in your project root, which will contain the Python interpreter and libraries for this project.

**Activate the virtual environment:**

*   **On macOS and Linux:**
    ```bash
    source .venv/bin/activate
    ```
*   **On Windows (Command Prompt or PowerShell):**
    ```bash
    .venv\Scripts\activate
    ```
After activation, your command prompt should show `(.venv)` at the beginning, indicating that the virtual environment is active.

## 3. Install Dependencies

Once the virtual environment is activated, install the required Python packages using the `requirements.txt` file.

```bash
pip install -r requirements.txt
```
This command will download and install libraries such as `geopandas`, `fiona`, `playwright`, and `pandas` into your virtual environment.

## 4. Install Playwright Browsers

The Playwright library requires browser binaries to perform web scraping tasks.

It's recommended to install these using `npx`, which leverages the Playwright version managed by the project's Node.js dependencies:
```bash
npx playwright install
```
Alternatively, if you have `playwright` installed directly in your Python virtual environment and prefer to use the Python command:
```bash
python -m playwright install
```
This will download the necessary browser executables (Chromium, Firefox, WebKit).

## 5. A Note on GDAL (for Geopandas and Fiona)

The Python packages `geopandas` and `fiona` are powerful for working with geospatial data, but they depend on a C/C++ library called **GDAL**. Installing GDAL can sometimes be challenging as it needs to be compiled or installed correctly for your specific operating system.

**If `pip install -r requirements.txt` fails with errors related to `geopandas`, `fiona`, or GDAL:**

*   You likely need to install GDAL on your system *before* `pip` can successfully build/install `geopandas` and `fiona`.
*   **Common installation methods for GDAL:**
    *   **Ubuntu/Debian Linux:** `sudo apt-get install gdal-bin libgdal-dev`
    *   **macOS (using Homebrew):** `brew install gdal`
    *   **Windows:** This is often the most complex. Consider using pre-compiled wheels from sources like [Christoph Gohlke's Python Extension Packages for Windows](https://www.lfd.uci.edu/~gohlke/pythonlibs/#gdal) (download the appropriate GDAL and Fiona wheels for your Python version and architecture, then `pip install <filename.whl>`), or installing via OSGeo4W.
*   After installing GDAL system-wide (or making it available in your PATH), try running `pip install -r requirements.txt` again within your activated virtual environment.

**Application Error Indication:** If you see an error message from the application like *"Geopandas/Fiona library not found. Please ensure it is installed in the Python environment."*, it strongly suggests that GDAL and its Python bindings (`geopandas`, `fiona`) were not installed correctly. Please revisit this section and ensure GDAL is properly set up.

---

Once these steps are completed, your Python scripting environment should be ready. Remember to activate the virtual environment (`source .venv/bin/activate` or `.venv\Scripts\activate`) in your terminal session whenever you intend to run the Python scripts directly or if the application needs to invoke them.
