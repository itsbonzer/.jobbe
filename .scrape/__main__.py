import sys

# Disable .pyc/__pycache__ writes for app entrypoint runs.
sys.dont_write_bytecode = True

from runner import main

main()